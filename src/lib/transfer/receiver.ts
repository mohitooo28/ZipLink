import type { ControlMessage, ManifestFile, SavedFile } from "@/types/transfer";
import type { ChannelIO } from "@/lib/webrtc/data-channel";
import { assertExpectedChunk, decodeChunk, ProtocolError } from "./chunk-protocol";
import type { FileSink, SaveTarget } from "./file-writer";
import { TransferAbortedError } from "./sender";

/**
 * Receives a transfer and writes it to a SaveTarget.
 *
 * Every incoming message is processed on one serial queue, so writes happen
 * in order and control messages ("file-end", "done") are only handled after
 * the preceding chunks are written. The sender's in-flight window bounds how
 * much can wait in this queue.
 */

export interface ManifestInfo {
  transferId: number;
  files: ManifestFile[];
  totalBytes: number;
  chunkSize: number;
}

export interface ReceiverProgress {
  writtenBytes: number;
  fileIndex: number;
  fileWrittenBytes: number;
}

export interface TransferReceiverEvents {
  onManifest?: (manifest: ManifestInfo) => void;
  onFileStart?: (index: number, savedAs: string | null) => void;
  onProgress?: (progress: ReceiverProgress) => void;
  onFileSaved?: (file: SavedFile) => void;
  onFinalizing?: () => void;
  onComplete?: (files: SavedFile[]) => void;
  onError?: (error: Error) => void;
}

const PROGRESS_BYTES = 512 * 1024;
const PROGRESS_MS = 150;

interface ActiveFile {
  index: number;
  sink: FileSink;
  written: number;
  chunkIndex: number;
}

export class TransferReceiver {
  private manifest: ManifestInfo | null = null;
  private target: SaveTarget | null = null;
  private queue: Promise<void> = Promise.resolve();
  private active: ActiveFile | null = null;
  private nextIndex = 0;
  private writtenBytes = 0;
  private lastProgressBytes = 0;
  private lastProgressAt = 0;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly saved: SavedFile[] = [];
  private started = false;
  private finished = false;
  private failure: Error | null = null;

  constructor(
    private readonly io: ChannelIO,
    private readonly events: TransferReceiverEvents = {},
    private readonly now: () => number = Date.now,
  ) {}

  get manifestInfo(): ManifestInfo | null {
    return this.manifest;
  }

  get savedFiles(): readonly SavedFile[] {
    return this.saved;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  handleControl(message: ControlMessage): void {
    if (this.failure || this.finished) return;
    if (message.t === "manifest") {
      if (this.manifest) return this.fail(new ProtocolError("Received a second manifest"));
      this.manifest = {
        transferId: message.transferId,
        files: message.files,
        totalBytes: message.totalBytes,
        chunkSize: message.chunkSize,
      };
      this.events.onManifest?.(this.manifest);
      return;
    }
    if (message.t === "cancel") {
      this.abort(message.reason || "The sender cancelled the transfer.", true);
      return;
    }
    if (!this.started) return this.fail(new ProtocolError(`Unexpected "${message.t}" before start`));
    this.enqueue(() => this.processControl(message));
  }

  handleBinary(data: ArrayBuffer): void {
    if (this.failure || this.finished) return;
    if (!this.started) return this.fail(new ProtocolError("Received data before the transfer started"));
    this.enqueue(() => this.processChunk(data));
  }

  /** Begin receiving into `target` (the user has chosen where to save). */
  begin(target: SaveTarget): void {
    if (this.started || !this.manifest || this.failure) return;
    this.started = true;
    this.target = target;
    this.io.sendControl({ t: "start" });
  }

  /** Stop and remove partially written output. */
  abort(reason: string, byPeer = false): void {
    if (this.failure || this.finished) return;
    this.failure = new TransferAbortedError(reason, byPeer);
    if (!byPeer && this.io.isOpen) {
      try {
        this.io.sendControl({ t: "cancel", reason });
      } catch {
        // Channel already closing.
      }
    }
    void this.discardPartial();
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue
      .then(() => (this.failure ? undefined : task()))
      .catch((error: unknown) => this.fail(error instanceof Error ? error : new Error(String(error))));
  }

  private async processControl(message: ControlMessage): Promise<void> {
    const manifest = this.requireManifest();
    switch (message.t) {
      case "file-start": {
        if (this.active) throw new ProtocolError("File started before the previous one ended");
        if (message.index !== this.nextIndex || message.index >= manifest.files.length) {
          throw new ProtocolError("Files arrived out of order");
        }
        const sink = await this.requireTarget().createFile(manifest.files[message.index]);
        this.active = { index: message.index, sink, written: 0, chunkIndex: 0 };
        this.events.onFileStart?.(message.index, null);
        break;
      }
      case "file-end": {
        const active = this.active;
        const expected = manifest.files[message.index];
        if (!active || active.index !== message.index || !expected) {
          throw new ProtocolError("Unexpected end of file");
        }
        if (message.size !== expected.size || active.written !== expected.size) {
          throw new ProtocolError(
            `"${expected.name}" is incomplete (${active.written} of ${expected.size} bytes)`,
          );
        }
        const saved = await active.sink.close();
        this.active = null;
        this.nextIndex += 1;
        this.saved.push(saved);
        this.reportProgress(active.index, active.written, true);
        this.io.sendControl({ t: "file-done", index: active.index });
        this.events.onFileSaved?.(saved);
        break;
      }
      case "done": {
        if (this.active || this.nextIndex !== manifest.files.length) {
          throw new ProtocolError("Transfer ended before every file was received");
        }
        this.events.onFinalizing?.();
        this.finished = true;
        this.io.sendControl({ t: "done-ack" });
        this.events.onComplete?.([...this.saved]);
        break;
      }
      default:
        throw new ProtocolError(`Unexpected "${message.t}" message`);
    }
  }

  private async processChunk(data: ArrayBuffer): Promise<void> {
    const manifest = this.requireManifest();
    const active = this.active;
    if (!active) throw new ProtocolError("Received data outside of a file");
    const chunk = decodeChunk(data);
    assertExpectedChunk(chunk, {
      transferId: manifest.transferId,
      fileIndex: active.index,
      chunkIndex: active.chunkIndex,
      offset: active.written,
      fileSize: manifest.files[active.index].size,
      maxPayload: manifest.chunkSize,
    });
    await active.sink.write(chunk.payload);
    active.written += chunk.payload.byteLength;
    active.chunkIndex += 1;
    this.writtenBytes += chunk.payload.byteLength;
    this.reportProgress(active.index, active.written, false);
  }

  private reportProgress(fileIndex: number, fileWritten: number, force: boolean): void {
    const now = this.now();
    if (
      !force &&
      this.writtenBytes - this.lastProgressBytes < PROGRESS_BYTES &&
      now - this.lastProgressAt < PROGRESS_MS
    ) {
      // Throttled — but make sure the latest count is always sent eventually,
      // otherwise a sender waiting on its flow-control window could stall.
      this.progressTimer ??= setTimeout(() => {
        this.progressTimer = null;
        if (!this.failure && !this.finished) this.reportProgress(fileIndex, fileWritten, true);
      }, PROGRESS_MS);
      return;
    }
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.lastProgressBytes = this.writtenBytes;
    this.lastProgressAt = now;
    if (this.io.isOpen) {
      this.io.sendControl({
        t: "progress",
        written: this.writtenBytes,
        index: fileIndex,
        fileWritten,
      });
    }
    this.events.onProgress?.({ writtenBytes: this.writtenBytes, fileIndex, fileWrittenBytes: fileWritten });
  }

  private requireManifest(): ManifestInfo {
    if (!this.manifest) throw new ProtocolError("No manifest received");
    return this.manifest;
  }

  private requireTarget(): SaveTarget {
    if (!this.target) throw new ProtocolError("No destination selected");
    return this.target;
  }

  private fail(error: Error): void {
    if (this.failure || this.finished) return;
    const reason =
      error instanceof ProtocolError
        ? `Transfer data was invalid: ${error.message}.`
        : error.name === "QuotaExceededError"
          ? "Not enough storage space to save the files."
          : error.message || "Couldn't save the received files.";
    this.abort(reason);
    this.events.onError?.(this.failure ?? error);
  }

  private async discardPartial(): Promise<void> {
    const active = this.active;
    this.active = null;
    // Let any in-flight write settle before aborting the sink.
    await this.queue.catch(() => undefined);
    await active?.sink.abort().catch(() => undefined);
    await this.target?.dispose(false).catch(() => undefined);
  }
}
