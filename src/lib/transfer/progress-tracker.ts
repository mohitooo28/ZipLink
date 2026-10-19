import type { FileProgress, FileTransferStatus, ManifestFile, TransferProgressSnapshot } from "@/types/transfer";
import { ProgressMeter } from "./progress-meter";

/** Per-file and overall progress built from confirmed byte counts. */
export class ProgressTracker {
  private files: FileProgress[];
  private readonly totalBytes: number;
  private transferredBytes = 0;
  private currentIndex: number | null = null;
  private startedAt: number | null = null;
  private finishedAt: number | null = null;
  private readonly meter = new ProgressMeter();

  constructor(
    manifest: readonly Pick<ManifestFile, "index" | "name" | "size" | "type">[],
    private readonly now: () => number = Date.now,
  ) {
    this.files = manifest.map((file) => ({
      index: file.index,
      name: file.name,
      size: file.size,
      type: file.type,
      transferred: 0,
      status: "pending" as FileTransferStatus,
    }));
    this.totalBytes = manifest.reduce((sum, file) => sum + file.size, 0);
  }

  start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = this.now();
    this.meter.record(0, this.startedAt);
  }

  update(totalTransferred: number, fileIndex: number, fileTransferred: number): void {
    this.start();
    this.transferredBytes = Math.min(this.totalBytes, Math.max(this.transferredBytes, totalTransferred));
    this.meter.record(this.transferredBytes, this.now());
    this.setFile(fileIndex, (file) => ({
      ...file,
      transferred: Math.min(file.size, Math.max(file.transferred, fileTransferred)),
      status: file.status === "pending" ? "active" : file.status,
    }));
    this.currentIndex = fileIndex;
  }

  markActive(index: number): void {
    this.start();
    this.currentIndex = index;
    this.setFile(index, (file) => (file.status === "pending" ? { ...file, status: "active" } : file));
  }

  markDone(index: number, displayName?: string): void {
    this.setFile(index, (file) => ({
      ...file,
      name: displayName ?? file.name,
      transferred: file.size,
      status: "done",
    }));
  }

  /** Mark the file in progress (and nothing else) as failed. */
  markActiveFailed(): void {
    this.files = this.files.map((file) => (file.status === "active" ? { ...file, status: "failed" } : file));
  }

  finish(): void {
    this.finishedAt = this.now();
    this.currentIndex = null;
  }

  snapshot(): TransferProgressSnapshot {
    const now = this.now();
    const running = this.startedAt !== null && this.finishedAt === null;
    return {
      files: this.files,
      totalBytes: this.totalBytes,
      transferredBytes: this.transferredBytes,
      bytesPerSecond: running ? this.meter.bytesPerSecond(now) : 0,
      etaSeconds: running ? this.meter.etaSeconds(this.totalBytes, now) : null,
      currentIndex: this.currentIndex,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  private setFile(index: number, update: (file: FileProgress) => FileProgress): void {
    const file = this.files[index];
    if (!file) return;
    const next = update(file);
    if (next === file) return;
    this.files = this.files.slice();
    this.files[index] = next;
  }
}
