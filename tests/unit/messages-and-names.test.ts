import { describe, expect, it } from "vitest";
import { numberedName, resolveUniqueName, sanitizeFileName } from "@/lib/transfer/file-names";
import { parseControlMessage, parseSignalMessage } from "@/lib/utils/validate-transfer-message";

describe("parseControlMessage", () => {
  const manifest = {
    t: "manifest",
    transferId: 5,
    totalBytes: 15,
    chunkSize: 65536,
    files: [
      { index: 0, name: "a.txt", size: 10, type: "text/plain", lastModified: 1 },
      { index: 1, name: "empty", size: 0, type: "", lastModified: 0 },
      { index: 2, name: "📷 фото.jpg", size: 5, type: "image/jpeg", lastModified: 2 },
    ],
  };

  it("accepts a well-formed manifest", () => {
    expect(parseControlMessage(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("rejects malformed manifests", () => {
    const variants = [
      { ...manifest, totalBytes: 16 },
      { ...manifest, files: [] },
      { ...manifest, chunkSize: 0 },
      { ...manifest, files: [{ ...manifest.files[0], index: 3 }] },
      { ...manifest, files: [{ ...manifest.files[0], size: -1 }] },
      { ...manifest, files: [{ ...manifest.files[0], name: "" }] },
      { ...manifest, transferId: 2 ** 33 },
    ];
    for (const variant of variants) expect(parseControlMessage(JSON.stringify(variant))).toBeNull();
  });

  it("parses simple control messages and rejects garbage", () => {
    expect(parseControlMessage('{"t":"start"}')).toEqual({ t: "start" });
    expect(parseControlMessage('{"t":"file-end","index":1,"size":0}')).toEqual({ t: "file-end", index: 1, size: 0 });
    expect(parseControlMessage('{"t":"progress","written":5,"index":0,"fileWritten":5}')).not.toBeNull();
    expect(parseControlMessage('{"t":"file-end","index":-1,"size":0}')).toBeNull();
    expect(parseControlMessage('{"t":"progress","written":1.5,"index":0,"fileWritten":1}')).toBeNull();
    expect(parseControlMessage('{"t":"nope"}')).toBeNull();
    expect(parseControlMessage("not json")).toBeNull();
    expect(parseControlMessage("[1,2]")).toBeNull();
    expect(parseControlMessage(JSON.stringify({ t: "cancel", reason: "x".repeat(500) }))).toBeNull();
  });
});

describe("parseSignalMessage", () => {
  it("accepts valid signals", () => {
    expect(parseSignalMessage({ v: 1, type: "ready", from: "receiver" })).toEqual({ v: 1, type: "ready", from: "receiver" });
    expect(parseSignalMessage({ v: 1, type: "offer", from: "sender", sdp: "v=0", attempt: 0 })).not.toBeNull();
    expect(
      parseSignalMessage({ v: 1, type: "ice", from: "sender", candidates: [{ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 }] }),
    ).not.toBeNull();
  });

  it("rejects spoofed or malformed signals", () => {
    expect(parseSignalMessage({ v: 1, type: "offer", from: "receiver", sdp: "v=0", attempt: 0 })).toBeNull();
    expect(parseSignalMessage({ v: 1, type: "accept", from: "sender", requestId: "x" })).toBeNull();
    expect(parseSignalMessage({ v: 2, type: "ready", from: "receiver" })).toBeNull();
    expect(parseSignalMessage({ v: 1, type: "ice", from: "sender", candidates: [{ candidate: 5 }] })).toBeNull();
    expect(
      parseSignalMessage({ v: 1, type: "ice", from: "sender", candidates: Array.from({ length: 65 }, () => ({ candidate: "c" })) }),
    ).toBeNull();
    expect(parseSignalMessage({ v: 1, type: "offer", from: "sender", sdp: "x".repeat(70_000), attempt: 0 })).toBeNull();
    expect(parseSignalMessage(null)).toBeNull();
    expect(parseSignalMessage("ready")).toBeNull();
  });
});

describe("file names", () => {
  it("sanitizes unsafe names but keeps Unicode", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFileName('a<b>c:"d"|e?f*.txt')).toBe("a_b_c__d__e_f_.txt");
    expect(sanitizeFileName("  .hidden  ")).toBe("hidden");
    expect(sanitizeFileName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("résumé 📄 ファイル.pdf")).toBe("résumé 📄 ファイル.pdf");
    const long = sanitizeFileName(`${"x".repeat(300)}.tar.gz`);
    expect(long.length).toBe(200);
    expect(long.endsWith(".gz")).toBe(true);
  });

  it("numbers duplicates without overwriting", async () => {
    expect(numberedName("photo.jpg", 2)).toBe("photo (2).jpg");
    expect(numberedName("README", 1)).toBe("README (1)");
    const taken = new Set(["photo.jpg", "photo (1).jpg"]);
    expect(await resolveUniqueName("photo.jpg", (name) => taken.has(name))).toBe("photo (2).jpg");
    expect(await resolveUniqueName("new.jpg", async () => false)).toBe("new.jpg");
  });
});
