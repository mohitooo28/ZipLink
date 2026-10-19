import { resolveObjectURL } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { ManifestFile, SavedFile } from "@/types/transfer";
import { HEADER_BYTES } from "@/lib/transfer/chunk-protocol";
import { resolveUniqueName, sanitizeFileName } from "@/lib/transfer/file-names";
import { MemorySaveTarget, type FileSink, type SaveTarget } from "@/lib/transfer/file-writer";
import { TransferReceiver } from "@/lib/transfer/receiver";
import { TransferAbortedError, TransferSender } from "@/lib/transfer/sender";
import { ChannelClosedError, ChannelIO } from "@/lib/webrtc/data-channel";
import { FakeChannel } from "../support/fake-channel";

interface Written {
  name: string;
  chunks: Uint8Array[];
  closed: boolean;
  aborted: boolean;
}

/** Collects written bytes; optionally slow, to exercise flow control. */
class CollectingTarget implements SaveTarget {
  readonly kind = "memory" as const;
  readonly label = "test";
  readonly files: Written[] = [];
  disposed = false;
  writtenBytes = 0;
  private used = new Set<string>();

  constructor(private readonly writeDelayMs = 0) {}

  async createFile(file: ManifestFile): Promise<FileSink> {
    const name = await resolveUniqueName(sanitizeFileName(file.name), (c) => this.used.has(c.toLowerCase()));
    this.used.add(name.toLowerCase());
    const entry: Written = { name, chunks: [], closed: false, aborted: false };
    this.files.push(entry);
    return {
      write: async (chunk) => {
        if (this.writeDelayMs) await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
        entry.chunks.push(chunk.slice());
        this.writtenBytes += chunk.byteLength;
      },
      close: async () => {
        entry.closed = true;
        return { index: file.index, name, size: file.size };
      },
      abort: async () => {
        entry.aborted = true;
      },
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

function bytes(length: number, seed = 1): Uint8Array {
  const data = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i += 1) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = x & 0xff;
  }
  return data;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const CHUNK = 16 * 1024;
const HIGH_WATER = 128 * 1024;
const WINDOW = 256 * 1024;

function setup(files: File[], target: CollectingTarget) {
  const [a, b] = FakeChannel.pair();
  const senderIO = new ChannelIO(a, { highWaterMark: HIGH_WATER, lowWaterMark: 32 * 1024 });
  const receiverIO = new ChannelIO(b);
  const sender = new TransferSender(senderIO, files, {
    transferId: 42,
    chunkSize: CHUNK,
    windowBytes: WINDOW,
    readBlockBytes: 64 * 1024,
  });
  const handles: { receiver?: TransferReceiver } = {};
  const stats = { received: 0, maxUnwritten: 0 };
  const done = new Promise<SavedFile[]>((resolve, reject) => {
    const receiver = new TransferReceiver(receiverIO, {
      onManifest: () => receiver.begin(target),
      onComplete: resolve,
      onError: reject,
    });
    receiverIO.onControl((message) => {
      receiver.handleControl(message);
      if (message.t === "cancel") reject(new TransferAbortedError(message.reason, true));
    });
    receiverIO.onBinary((data) => {
      stats.received += data.byteLength - HEADER_BYTES;
      stats.maxUnwritten = Math.max(stats.maxUnwritten, stats.received - target.writtenBytes);
      receiver.handleBinary(data);
    });
    handles.receiver = receiver;
  });
  done.catch(() => undefined);
  senderIO.onControl((message) => sender.handleControl(message));
  return { a, b, sender, done, handles, stats };
}

describe("transfer engine", () => {
  it("transfers multiple files byte-for-byte, including empty, duplicate and Unicode names", async () => {
    const payloads = [bytes(300_000, 1), new Uint8Array(0), bytes(CHUNK * 3, 2), bytes(1, 3), bytes(70_001, 4)];
    const names = ["report.pdf", "empty.txt", "report.pdf", "📷 фото.jpg", "../escape.bin"];
    const files = payloads.map((data, i) => new File([data as BlobPart], names[i], { type: "application/octet-stream" }));
    const target = new CollectingTarget();
    const { a, sender, done } = setup(files, target);

    sender.sendManifest();
    const saved = await done;
    await sender.finished;

    expect(saved.map((f) => f.name)).toEqual(["report.pdf", "empty.txt", "report (1).pdf", "📷 фото.jpg", "_escape.bin"]);
    target.files.forEach((file, i) => {
      expect(file.closed).toBe(true);
      expect(file.aborted).toBe(false);
      expect(concat(file.chunks)).toEqual(payloads[i]);
    });
    expect(a.maxBufferedAmount).toBeLessThanOrEqual(HIGH_WATER);
  });

  it("bounds buffered and in-flight data when the receiver writes slowly", async () => {
    const data = bytes(1_500_000, 9);
    const target = new CollectingTarget(1);
    const { a, sender, done, stats } = setup([new File([data as BlobPart], "big.bin")], target);
    sender.sendManifest();
    await done;
    await sender.finished;
    expect(concat(target.files[0].chunks)).toEqual(data);
    expect(a.maxBufferedAmount).toBeLessThanOrEqual(HIGH_WATER);
    // Data waiting to be written on the receiver never exceeds the sender's window.
    expect(stats.maxUnwritten).toBeLessThanOrEqual(WINDOW);
    expect(stats.maxUnwritten).toBeGreaterThan(0);
  }, 30_000);

  it("sender cancellation stops the transfer and discards the partial file", async () => {
    const target = new CollectingTarget(2);
    const { sender, done, handles } = setup([new File([bytes(2_000_000) as BlobPart], "big.bin")], target);
    sender.sendManifest();
    await new Promise((resolve) => setTimeout(resolve, 60));
    sender.abort("The sender cancelled the transfer.");

    await expect(sender.finished).rejects.toMatchObject({ byPeer: false });
    await expect(done).rejects.toBeInstanceOf(TransferAbortedError);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handles.receiver?.isFinished).toBe(false);
    expect(target.files[0].aborted).toBe(true);
    expect(target.files[0].closed).toBe(false);
    expect(target.disposed).toBe(true);
  });

  it("receiver cancellation is reported to the sender as a peer cancel", async () => {
    const target = new CollectingTarget(2);
    const { sender, handles } = setup([new File([bytes(2_000_000) as BlobPart], "big.bin")], target);
    sender.sendManifest();
    await new Promise((resolve) => setTimeout(resolve, 60));
    handles.receiver?.abort("The receiver cancelled the transfer.");
    await expect(sender.finished).rejects.toMatchObject({ byPeer: true, message: "The receiver cancelled the transfer." });
  });

  it("rejects tampered chunks and cleans up", async () => {
    const target = new CollectingTarget();
    const files = [new File([bytes(200_000) as BlobPart], "x.bin")];
    const { a, sender, done } = setup(files, target);
    let binaryCount = 0;
    a.transform = (data) => {
      if (typeof data === "string") return data;
      binaryCount += 1;
      if (binaryCount !== 3) return data;
      const copy = data.slice(0);
      new DataView(copy).setUint32(20, 12345); // corrupt the offset
      return copy;
    };
    sender.sendManifest();
    await expect(done).rejects.toThrow(/offset mismatch/);
    await expect(sender.finished).rejects.toBeInstanceOf(TransferAbortedError);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(target.files[0].aborted).toBe(true);
  });

  it("fails the sender when the channel closes mid-transfer", async () => {
    const target = new CollectingTarget(2);
    const { a, sender } = setup([new File([bytes(3_000_000) as BlobPart], "big.bin")], target);
    sender.sendManifest();
    await new Promise((resolve) => setTimeout(resolve, 40));
    a.close();
    await expect(sender.finished).rejects.toBeInstanceOf(Error);
  });

  it("ChannelIO rejects sends after close and wakes blocked writers", async () => {
    const [a] = FakeChannel.pair();
    const io = new ChannelIO(a, { highWaterMark: 10 });
    a.bufferedAmount = 100; // pretend the buffer is full
    const pending = io.sendBinary(new ArrayBuffer(4));
    a.close();
    await expect(pending).rejects.toBeInstanceOf(ChannelClosedError);
    expect(() => io.sendControl({ t: "start" })).toThrow(ChannelClosedError);
  });

  it("refuses data before the receiver chose a destination", async () => {
    const [a, b] = FakeChannel.pair();
    const errors: Error[] = [];
    const receiver = new TransferReceiver(new ChannelIO(b), { onError: (e) => errors.push(e) });
    receiver.handleControl({ t: "manifest", transferId: 1, totalBytes: 1, chunkSize: CHUNK, files: [{ index: 0, name: "a", size: 1, type: "", lastModified: 0 }] });
    receiver.handleBinary(new ArrayBuffer(HEADER_BYTES + 1));
    expect(errors[0]?.message).toMatch(/before the transfer started/);
    a.close();
  });
});

describe("MemorySaveTarget", () => {
  it("assembles chunks into a downloadable blob and numbers duplicates", async () => {
    const target = new MemorySaveTarget();
    const meta = { index: 0, name: "a.txt", size: 6, type: "text/plain", lastModified: 0 };
    const sink = await target.createFile(meta);
    await sink.write(new TextEncoder().encode("hel"));
    await sink.write(new TextEncoder().encode("lo!"));
    const saved = await sink.close();
    expect(saved.name).toBe("a.txt");
    const blob = resolveObjectURL(saved.url!);
    expect(await blob?.text()).toBe("hello!");

    const second = await target.createFile({ ...meta, index: 1 });
    await second.abort();
    await second.abort(); // idempotent
    const third = await target.createFile({ ...meta, index: 2 });
    expect((await third.close()).name).toBe("a (2).txt");
    await target.dispose(false);
    expect(resolveObjectURL(saved.url!)).toBeUndefined();
  });
});
