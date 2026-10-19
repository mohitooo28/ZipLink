import type { ManifestFile, SavedFile, SaveTargetKind } from "@/types/transfer";
import { resolveUniqueName, sanitizeFileName } from "./file-names";

/**
 * Destinations for received files. Every target streams chunk by chunk; only
 * the memory fallback has to hold data until the file is complete.
 */

export interface FileSink {
  /** Resolves once the bytes are accepted by the underlying storage. */
  write(chunk: Uint8Array): Promise<void>;
  /** Flush and finalize. Only called after every expected byte was written. */
  close(): Promise<SavedFile>;
  /** Discard partial output. Safe to call more than once. */
  abort(): Promise<void>;
}

export interface SaveTarget {
  readonly kind: SaveTargetKind;
  /** Short human description, e.g. the chosen folder name. */
  readonly label: string;
  createFile(file: ManifestFile): Promise<FileSink>;
  /**
   * Release resources. `keepCompleted` keeps finished files available (for
   * the completion screen); otherwise everything this target produced that
   * is not on the user's disk is removed.
   */
  dispose(keepCompleted: boolean): Promise<void>;
}

export interface SaveCapabilities {
  directory: boolean;
  browserStorage: boolean;
}

/** Coalesce small chunks into larger writes — far fewer storage round-trips. */
const WRITE_BATCH_BYTES = 1024 * 1024;

export function detectSaveCapabilities(): SaveCapabilities {
  if (typeof window === "undefined") return { directory: false, browserStorage: false };
  const directory = window.isSecureContext && typeof window.showDirectoryPicker === "function";
  const browserStorage =
    window.isSecureContext &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype;
  return { directory, browserStorage };
}

async function entryExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return false;
    // TypeMismatchError: a folder with this name exists — treat as taken.
    return true;
  }
}

class WritableSink implements FileSink {
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private written = 0;
  private finished = false;

  constructor(
    private readonly writable: FileSystemWritableFileStream,
    private readonly onClose: () => Promise<SavedFile>,
    private readonly onAbort: () => Promise<void>,
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    // Chunks may be views into a reused buffer; copy before deferring.
    this.pending.push(chunk.slice());
    this.pendingBytes += chunk.byteLength;
    if (this.pendingBytes >= WRITE_BATCH_BYTES) await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.pendingBytes === 0) return;
    const batch = new Uint8Array(this.pendingBytes);
    let offset = 0;
    for (const part of this.pending) {
      batch.set(part, offset);
      offset += part.byteLength;
    }
    this.pending = [];
    this.pendingBytes = 0;
    await this.writable.write(batch);
    this.written += batch.byteLength;
  }

  async close(): Promise<SavedFile> {
    await this.flush();
    await this.writable.close();
    this.finished = true;
    return this.onClose();
  }

  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.pending = [];
    try {
      await this.writable.abort();
    } catch {
      // Already closed or errored — nothing more to release.
    }
    await this.onAbort();
  }
}

/** Writes straight into a folder the user picked (Chromium desktop). */
export class DirectorySaveTarget implements SaveTarget {
  readonly kind = "directory" as const;
  private readonly used = new Set<string>();

  private constructor(private readonly dir: FileSystemDirectoryHandle) {}

  get label(): string {
    return this.dir.name;
  }

  /** Must be called from a user gesture. */
  static async pick(): Promise<DirectorySaveTarget> {
    if (!window.showDirectoryPicker) throw new Error("Folder access is not supported");
    const dir = await window.showDirectoryPicker({ id: "ziplink", mode: "readwrite" });
    return new DirectorySaveTarget(dir);
  }

  async createFile(file: ManifestFile): Promise<FileSink> {
    const name = await resolveUniqueName(
      sanitizeFileName(file.name),
      async (candidate) =>
        this.used.has(candidate.toLowerCase()) || (await entryExists(this.dir, candidate)),
    );
    this.used.add(name.toLowerCase());
    const handle = await this.dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable({ keepExistingData: false });
    return new WritableSink(
      writable,
      async () => ({ index: file.index, name, size: file.size }),
      async () => {
        await this.dir.removeEntry(name).catch(() => undefined);
      },
    );
  }

  async dispose(): Promise<void> {
    // Files live in the user's folder; nothing to release.
  }
}

const OPFS_ROOT = "ziplink-incoming";
const OPFS_STALE_MS = 60 * 60 * 1000;

/**
 * Streams into the Origin Private File System, then offers a regular
 * download of the disk-backed file. Used where folder access is unavailable
 * (Firefox, Safari, Chrome on Android).
 */
export class BrowserStorageSaveTarget implements SaveTarget {
  readonly kind = "browser-storage" as const;
  readonly label = "Browser storage";
  private readonly used = new Set<string>();
  private readonly urls: string[] = [];

  private constructor(
    private readonly root: FileSystemDirectoryHandle,
    private readonly dirName: string,
    private readonly dir: FileSystemDirectoryHandle,
  ) {}

  static async create(): Promise<BrowserStorageSaveTarget> {
    const storageRoot = await navigator.storage.getDirectory();
    const root = await storageRoot.getDirectoryHandle(OPFS_ROOT, { create: true });
    await BrowserStorageSaveTarget.removeStale(root);
    const dirName = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = await root.getDirectoryHandle(dirName, { create: true });
    return new BrowserStorageSaveTarget(root, dirName, dir);
  }

  /** Remove leftovers from earlier visits so browser storage does not fill up. */
  private static async removeStale(root: FileSystemDirectoryHandle): Promise<void> {
    try {
      for await (const [name] of root.entries()) {
        const created = Number(name.split("-")[1]);
        if (!Number.isFinite(created) || Date.now() - created > OPFS_STALE_MS) {
          await root.removeEntry(name, { recursive: true }).catch(() => undefined);
        }
      }
    } catch {
      // Enumeration is best effort.
    }
  }

  async createFile(file: ManifestFile): Promise<FileSink> {
    const name = await resolveUniqueName(sanitizeFileName(file.name), (candidate) =>
      this.used.has(candidate.toLowerCase()),
    );
    this.used.add(name.toLowerCase());
    const handle = await this.dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable({ keepExistingData: false });
    return new WritableSink(
      writable,
      async () => {
        const stored = await handle.getFile();
        const url = URL.createObjectURL(stored);
        this.urls.push(url);
        return { index: file.index, name, size: file.size, url };
      },
      async () => {
        await this.dir.removeEntry(name).catch(() => undefined);
      },
    );
  }

  async dispose(keepCompleted: boolean): Promise<void> {
    if (keepCompleted) return;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
    await this.root.removeEntry(this.dirName, { recursive: true }).catch(() => undefined);
  }
}

/** Above this the memory fallback is likely to exhaust the tab's memory. */
export const MEMORY_TARGET_WARN_BYTES = 512 * 1024 * 1024;
const MEMORY_PART_BYTES = 8 * 1024 * 1024;

/**
 * Last-resort fallback: assemble each file as a Blob. Parts are folded into
 * Blobs periodically so engines that page large Blobs to disk can do so, but
 * the browser may still keep the data in memory.
 */
export class MemorySaveTarget implements SaveTarget {
  readonly kind = "memory" as const;
  readonly label = "Browser memory";
  private readonly used = new Set<string>();
  private readonly urls: string[] = [];

  async createFile(file: ManifestFile): Promise<FileSink> {
    const name = await resolveUniqueName(sanitizeFileName(file.name), (candidate) =>
      this.used.has(candidate.toLowerCase()),
    );
    this.used.add(name.toLowerCase());
    const type = file.type || "application/octet-stream";
    let blobs: Blob[] = [];
    let parts: Uint8Array[] = [];
    let partBytes = 0;
    let done = false;

    const fold = () => {
      if (parts.length === 0) return;
      blobs.push(new Blob(parts as BlobPart[], { type }));
      parts = [];
      partBytes = 0;
    };

    return {
      write: async (chunk) => {
        parts.push(chunk.slice());
        partBytes += chunk.byteLength;
        if (partBytes >= MEMORY_PART_BYTES) fold();
      },
      close: async () => {
        fold();
        done = true;
        const blob = new Blob(blobs, { type });
        blobs = [];
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        return { index: file.index, name, size: file.size, url };
      },
      abort: async () => {
        if (done) return;
        done = true;
        blobs = [];
        parts = [];
      },
    };
  }

  async dispose(keepCompleted: boolean): Promise<void> {
    if (keepCompleted) return;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
  }
}

/** Free space check for browser-managed storage (best effort). */
export async function estimateFreeBrowserStorage(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return null;
    return Math.max(0, estimate.quota - (estimate.usage ?? 0));
  } catch {
    return null;
  }
}
