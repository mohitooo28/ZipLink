import type { ControlMessage, ManifestFile } from "@/types/transfer";
import type { ChannelIO } from "@/lib/webrtc/data-channel";
import { encodeChunk } from "./chunk-protocol";

/**
 * Streams files over a ChannelIO.
 *
 * Memory stays bounded by three limits:
 *  - at most `readBlockBytes` of file data is read from disk at a time,
 *  - the DataChannel buffer is capped by ChannelIO's high-water mark,
 *  - at most `windowBytes` may be in flight beyond what the receiver has
 *    confirmed as written, so a slow disk on the other side slows us down.
 */

export interface SenderProgress {
  /** Bytes the receiver confirmed as written. */
  confirmedBytes: number;
  fileIndex: number;
  fileConfirmedBytes: number;
}

export interface TransferSenderEvents {
  onStart?: () => void;
  onProgress?: (progress: SenderProgress) => void;
  onFileComplete?: (index: number) => void;
  onFinalizing?: () => void;
}

export interface TransferSenderOptions {
  transferId: number;
  chunkSize: number;
  windowBytes?: number;
  readBlockBytes?: number;
}

export class TransferAbortedError extends Error {
  constructor(
    message: string,
    readonly byPeer: boolean,
  ) {
    super(message);
    this.name = "TransferAbortedError";
  }
}

export class FileReadError extends Error {
  constructor(fileName: string) {
    super(`Couldn't read "${fileName}". It may have been moved, changed or deleted.`);
    this.name = "FileReadError";
  }
}

export function buildManifest(files: readonly File[]): ManifestFile[] {
  return files.map((file, index) => ({
    index,
    name: file.name || `file-${index + 1}`,
    size: file.size,
    type: file.type,
    lastModified: Math.max(0, Math.floor(file.lastModified || 0)),
  }));
}

export class TransferSender {
  private readonly windowBytes: number;
  private readonly readBlockBytes: number;
  private sentBytes = 0;
  private confirmedBytes = 0;
  private started = false;
  private aborted: TransferAbortedError | null = null;
  private wakers = new Set<() => void>();
  private settle!: { resolve: () => void; reject: (error: Error) => void };
  /** Resolves when the receiver confirms every file was finalized. */
  readonly finished: Promise<void>;

  constructor(
    private readonly io: ChannelIO,
    private readonly files: readonly File[],
    private readonly options: TransferSenderOptions,
    private readonly events: TransferSenderEvents = {},
  ) {
    this.windowBytes = options.windowBytes ?? 16 * 1024 * 1024;
    this.readBlockBytes = Math.max(options.chunkSize, options.readBlockBytes ?? 1024 * 1024);
    this.finished = new Promise<void>((resolve, reject) => {
      this.settle = { resolve, reject };
    });
    // Avoid unhandled-rejection noise when nobody awaits `finished`.
    this.finished.catch(() => undefined);
  }

  sendManifest(): void {
    const manifest = buildManifest(this.files);
    this.io.sendControl({
      t: "manifest",
      transferId: this.options.transferId,
      files: manifest,
      totalBytes: manifest.reduce((sum, file) => sum + file.size, 0),
      chunkSize: this.options.chunkSize,
    });
  }

  handleControl(message: ControlMessage): void {
    if (this.aborted) return;
    switch (message.t) {
      case "start":
        if (this.started) return;
        this.started = true;
        this.events.onStart?.();
        void this.run().catch((error: unknown) => this.fail(error));
        break;
      case "progress":
        if (message.written >= this.confirmedBytes && message.written <= this.sentBytes) {
          this.confirmedBytes = message.written;
          this.events.onProgress?.({
            confirmedBytes: message.written,
            fileIndex: message.index,
            fileConfirmedBytes: message.fileWritten,
          });
          this.wake();
        }
        break;
      case "file-done":
        this.events.onFileComplete?.(message.index);
        break;
      case "done-ack":
        this.settle.resolve();
        break;
      case "cancel":
        this.abort(message.reason || "The receiver cancelled the transfer.", true);
        break;
      default:
        break;
    }
  }

  /** Stop sending. `byPeer` marks cancellations initiated by the other side. */
  abort(reason: string, byPeer = false): void {
    if (this.aborted) return;
    this.aborted = new TransferAbortedError(reason, byPeer);
    if (!byPeer && this.io.isOpen) {
      try {
        this.io.sendControl({ t: "cancel", reason });
      } catch {
        // Channel already closing.
      }
    }
    this.wake();
    this.settle.reject(this.aborted);
  }

  private fail(error: unknown): void {
    if (this.aborted) return;
    const message = error instanceof Error ? error.message : "The transfer failed.";
    this.abort(message);
  }

  private async run(): Promise<void> {
    const { transferId, chunkSize } = this.options;
    for (let index = 0; index < this.files.length; index += 1) {
      const file = this.files[index];
      this.checkAborted();
      this.io.sendControl({ t: "file-start", index });

      let offset = 0;
      let chunkIndex = 0;
      while (offset < file.size) {
        const blockEnd = Math.min(file.size, offset + this.readBlockBytes);
        let block: Uint8Array;
        try {
          block = new Uint8Array(await file.slice(offset, blockEnd).arrayBuffer());
        } catch {
          throw new FileReadError(file.name);
        }
        if (block.byteLength !== blockEnd - offset) throw new FileReadError(file.name);

        for (let position = 0; position < block.byteLength; position += chunkSize) {
          const payload = block.subarray(position, Math.min(block.byteLength, position + chunkSize));
          await this.waitForWindow(payload.byteLength);
          this.checkAborted();
          await this.io.sendBinary(
            encodeChunk({ transferId, fileIndex: index, chunkIndex, offset }, payload),
          );
          offset += payload.byteLength;
          chunkIndex += 1;
          this.sentBytes += payload.byteLength;
        }
      }
      this.checkAborted();
      this.io.sendControl({ t: "file-end", index, size: file.size });
    }
    this.checkAborted();
    this.io.sendControl({ t: "done" });
    this.events.onFinalizing?.();
  }

  private async waitForWindow(nextBytes: number): Promise<void> {
    while (!this.aborted && this.sentBytes + nextBytes - this.confirmedBytes > this.windowBytes) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.wakers.delete(done);
          resolve();
        };
        // Periodic re-check guards against a lost wake-up.
        const timer = setTimeout(done, 250);
        this.wakers.add(done);
      });
    }
  }

  private wake(): void {
    for (const wake of [...this.wakers]) wake();
  }

  private checkAborted(): void {
    if (this.aborted) throw this.aborted;
  }
}
