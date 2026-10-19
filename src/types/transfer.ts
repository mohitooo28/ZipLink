/** Data-channel protocol and transfer progress types. */

export interface ManifestFile {
  index: number;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export type ControlMessage =
  /** sender → receiver: what is about to be sent. */
  | {
      t: "manifest";
      transferId: number;
      files: ManifestFile[];
      totalBytes: number;
      chunkSize: number;
    }
  /** receiver → sender: destination chosen, start streaming. */
  | { t: "start" }
  /** sender → receiver: following binary chunks belong to this file. */
  | { t: "file-start"; index: number }
  /** sender → receiver: all bytes for this file have been sent. */
  | { t: "file-end"; index: number; size: number }
  /** receiver → sender: bytes durably written so far (drives flow control). */
  | { t: "progress"; written: number; index: number; fileWritten: number }
  /** receiver → sender: file fully written and closed. */
  | { t: "file-done"; index: number }
  /** sender → receiver: every file has been sent. */
  | { t: "done" }
  /** receiver → sender: every file has been finalized. */
  | { t: "done-ack" }
  /** either side: stop the transfer. */
  | { t: "cancel"; reason: string };

export type ControlType = ControlMessage["t"];

export interface ChunkHeader {
  transferId: number;
  fileIndex: number;
  chunkIndex: number;
  offset: number;
}

export type FileTransferStatus = "pending" | "active" | "done" | "failed";

export interface FileProgress {
  index: number;
  name: string;
  size: number;
  type: string;
  transferred: number;
  status: FileTransferStatus;
}

export interface TransferProgressSnapshot {
  files: FileProgress[];
  totalBytes: number;
  transferredBytes: number;
  bytesPerSecond: number;
  /** null until the estimate is meaningful. */
  etaSeconds: number | null;
  currentIndex: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export type ConnectionRoute = "direct" | "relay" | "unknown";

export type SaveTargetKind = "directory" | "browser-storage" | "memory";

export interface SavedFile {
  index: number;
  name: string;
  size: number;
  /** Object URL for targets that need an explicit download step. */
  url?: string;
}

export interface PhaseError {
  code: string;
  message: string;
}
