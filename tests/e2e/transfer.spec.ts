import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";

interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function openPair(browser: Browser) {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext({ acceptDownloads: true });
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  return {
    sender,
    receiver,
    close: async () => {
      await senderContext.close();
      await receiverContext.close();
    },
  };
}

async function startSharing(sender: Page, files: TestFile[]): Promise<string> {
  await sender.goto("/send");
  await sender.getByTestId("file-input").first().setInputFiles(files);
  const label = `${files.length} ${files.length === 1 ? "file" : "files"}`;
  await expect(sender.getByTestId("selection-summary")).toContainText(label);
  await expect(sender.getByTestId("start-sharing")).toBeEnabled();
  await sender.getByTestId("start-sharing").click();
  const codeButton = sender.getByTestId("share-code");
  await expect(codeButton).toBeVisible();
  const code = await codeButton.getAttribute("data-code");
  expect(code).toMatch(/^\d{5}$/);
  return code!;
}

async function enterCode(receiver: Page, code: string) {
  await receiver.goto("/receive");
  await receiver.getByTestId("code-digit-0").click();
  // Typing the fifth digit submits automatically.
  await receiver.keyboard.type(code, { delay: 30 });
}

test.describe("ZipLink end-to-end", () => {
  test("transfers multiple files peer-to-peer after approval, with identical contents", async ({ browser }) => {
    const files: TestFile[] = [
      { name: "large-random.bin", mimeType: "application/octet-stream", buffer: randomBytes(3 * 1024 * 1024 + 123) },
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("first notes file\n") },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("second notes file — same name\n") },
      { name: "📷 фото-写真.bin", mimeType: "application/octet-stream", buffer: randomBytes(70_001) },
    ];
    const { sender, receiver, close } = await openPair(browser);

    const code = await startSharing(sender, files);
    await enterCode(receiver, code);
    await expect(receiver.getByText("Waiting for the sender to approve")).toBeVisible();

    const request = sender.getByTestId("pending-request");
    await expect(request).toBeVisible();
    await request.getByRole("button", { name: /^Accept/ }).click();

    // The receiver reviews the file list before any data flows.
    await expect(receiver.getByText("Connected — choose where to save")).toBeVisible({ timeout: 30_000 });
    await expect(receiver.getByText("large-random.bin")).toBeVisible();
    await receiver.getByTestId("receive-in-browser").click();

    await expect(receiver.getByTestId("completion")).toBeVisible({ timeout: 60_000 });
    await expect(sender.getByTestId("completion")).toBeVisible({ timeout: 15_000 });
    await expect(sender.getByText("Files delivered")).toBeVisible();

    // Download every file and compare bytes with what was sent.
    const links = receiver.getByTestId("download-link");
    await expect(links).toHaveCount(files.length);
    const expectedNames = ["large-random.bin", "empty.txt", "notes.txt", "notes (1).txt", "📷 фото-写真.bin"];
    for (let i = 0; i < files.length; i += 1) {
      const [download] = await Promise.all([receiver.waitForEvent("download"), links.nth(i).click()]);
      expect(download.suggestedFilename()).toBe(expectedNames[i]);
      const path = await download.path();
      const contents = await readFile(path);
      expect(contents.length).toBe(files[i].buffer.length);
      expect(sha256(contents)).toBe(sha256(files[i].buffer));
    }
    await close();
  });

  test("a rejected receiver is told, and the sender keeps waiting", async ({ browser }) => {
    const { sender, receiver, close } = await openPair(browser);
    const code = await startSharing(sender, [{ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") }]);
    await enterCode(receiver, code);
    const request = sender.getByTestId("pending-request");
    await request.getByRole("button", { name: /^Reject/ }).click();

    await expect(receiver.getByText("Request declined")).toBeVisible({ timeout: 10_000 });
    await expect(sender.getByText("Waiting for a receiver")).toBeVisible();
    await expect(sender.getByTestId("share-code")).toHaveAttribute("data-code", code);
    await close();
  });

  test("invalid codes and expired links produce clear errors", async ({ browser }) => {
    const { sender, receiver, close } = await openPair(browser);
    const code = await startSharing(sender, [{ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") }]);
    const wrong = code === "99999" ? "99998" : "99999";

    await enterCode(receiver, wrong);
    await expect(receiver.getByText("No active session matches this code.")).toBeVisible();

    await receiver.goto(`/receive?code=${code}&token=${"A".repeat(43)}`);
    await expect(receiver.getByText("Invitation link detected")).toBeVisible();
    // The token is removed from the address bar once read.
    await expect.poll(() => new URL(receiver.url()).searchParams.has("token")).toBe(false);
    await receiver.getByTestId("join").click();
    await expect(receiver.getByText("This invitation link is invalid or has expired.")).toBeVisible();
    await close();
  });

  test("the QR/share link joins with the code pre-filled; cancelling cleans up both sides", async ({ browser }) => {
    const { sender, receiver, close } = await openPair(browser);
    await startSharing(sender, [{ name: "big.bin", mimeType: "application/octet-stream", buffer: randomBytes(40 * 1024 * 1024) }]);
    const link = await sender.getByTestId("share-link").getAttribute("href");
    expect(link).toContain("token=");

    await receiver.goto(link!);
    await receiver.getByTestId("join").click();
    await sender.getByTestId("pending-request").getByRole("button", { name: /^Accept/ }).click();
    await receiver.getByTestId("receive-in-browser").click();
    await expect(sender.getByText("Transferring files")).toBeVisible({ timeout: 30_000 });

    await sender.getByRole("button", { name: "Cancel transfer" }).click();
    await sender.getByRole("dialog").getByRole("button", { name: "Cancel transfer" }).click();
    await expect(sender.getByText("Transfer cancelled")).toBeVisible();
    await expect(receiver.getByText("Transfer cancelled")).toBeVisible({ timeout: 15_000 });
    await expect(receiver.getByText("The sender cancelled the transfer.")).toBeVisible();
    await close();
  });

  test("closing the sender tab mid-transfer fails the receiver instead of hanging", async ({ browser }) => {
    const { sender, receiver, close } = await openPair(browser);
    const code = await startSharing(sender, [{ name: "big.bin", mimeType: "application/octet-stream", buffer: randomBytes(40 * 1024 * 1024) }]);
    await enterCode(receiver, code);
    await sender.getByTestId("pending-request").getByRole("button", { name: /^Accept/ }).click();
    await receiver.getByTestId("receive-in-browser").click();
    await expect(receiver.getByText("Receiving files")).toBeVisible({ timeout: 30_000 });

    await sender.close({ runBeforeUnload: false });
    await expect(receiver.getByText(/Transfer (failed|cancelled)/)).toBeVisible({ timeout: 45_000 });
    await close();
  });
});

test.describe("layout", () => {
  for (const path of ["/", "/send", "/receive"]) {
    test(`${path} has no horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("landing page shows both actions and service readiness", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your files. Your devices.");
    await expect(page.getByRole("link", { name: /Send files/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Receive files/ })).toBeVisible();
    await expect(page.getByText("Ready to connect")).toBeVisible();
  });
});
