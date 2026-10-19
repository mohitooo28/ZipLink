import type { ChunkHeader, ControlMessage } from "@/types/transfer";

/**
 * Binary chunk framing.
 *
 *   byte  0      kind (1 = file chunk)
 *   byte  1      protocol version
 *   bytes 2-3    reserved (0)
 *   bytes 4-7    transfer id      (uint32)
 *   bytes 8-11   file index       (uint32)
 *   bytes 12-15  chunk index      (uint32)
 *   bytes 16-23  byte offset      (uint32 high, uint32 low)
 *   bytes 24-…   payload
 *
 * Control messages travel as JSON strings on the same ordered channel, so the
 * receiver sees "file-start → chunks → file-end" strictly in order.
 */

export const PROTOCOL_VERSION = 1;
export const CHUNK_KIND = 1;
export const HEADER_BYTES = 24;
export const DEFAULT_CHUNK_SIZE = 64 * 1024 - HEADER_BYTES;
/** Smallest payload we will negotiate down to. */
export const MIN_CHUNK_SIZE = 16 * 1024;

const TWO_POW_32 = 2 ** 32;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

/**
 * Payload size that keeps every message (header + payload) within the SCTP
 * max message size the peers negotiated.
 */
export function negotiateChunkSize(
  maxMessageSize: number | null | undefined,
  preferred = DEFAULT_CHUNK_SIZE,
): number {
  const limit =
    typeof maxMessageSize === "number" && Number.isFinite(maxMessageSize) && maxMessageSize > 0
      ? maxMessageSize
      : preferred + HEADER_BYTES;
  const payload = Math.min(preferred, limit - HEADER_BYTES);
  return Math.max(MIN_CHUNK_SIZE, Math.floor(payload));
}

export function encodeChunk(header: ChunkHeader, payload: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, CHUNK_KIND);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, 0);
  view.setUint32(4, header.transferId);
  view.setUint32(8, header.fileIndex);
  view.setUint32(12, header.chunkIndex);
  view.setUint32(16, Math.floor(header.offset / TWO_POW_32));
  view.setUint32(20, header.offset % TWO_POW_32);
  new Uint8Array(buffer, HEADER_BYTES).set(payload);
  return buffer;
}

export interface DecodedChunk {
  header: ChunkHeader;
  payload: Uint8Array;
}

export function decodeChunk(buffer: ArrayBuffer): DecodedChunk {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new ProtocolError("Chunk shorter than header");
  }
  const view = new DataView(buffer);
  if (view.getUint8(0) !== CHUNK_KIND) throw new ProtocolError("Unknown binary message kind");
  if (view.getUint8(1) !== PROTOCOL_VERSION) {
    throw new ProtocolError("Unsupported protocol version");
  }
  return {
    header: {
      transferId: view.getUint32(4),
      fileIndex: view.getUint32(8),
      chunkIndex: view.getUint32(12),
      offset: view.getUint32(16) * TWO_POW_32 + view.getUint32(20),
    },
    payload: new Uint8Array(buffer, HEADER_BYTES),
  };
}

export interface ExpectedChunk {
  transferId: number;
  fileIndex: number;
  chunkIndex: number;
  offset: number;
  fileSize: number;
  maxPayload: number;
}

/** Throws a ProtocolError if the chunk is not exactly the next one expected. */
export function assertExpectedChunk(chunk: DecodedChunk, expected: ExpectedChunk): void {
  const { header, payload } = chunk;
  if (header.transferId !== expected.transferId) throw new ProtocolError("Chunk for another transfer");
  if (header.fileIndex !== expected.fileIndex) throw new ProtocolError("Chunk for unexpected file");
  if (header.chunkIndex !== expected.chunkIndex) throw new ProtocolError("Chunk out of order");
  if (header.offset !== expected.offset) throw new ProtocolError("Chunk offset mismatch");
  if (payload.byteLength === 0) throw new ProtocolError("Empty chunk");
  if (payload.byteLength > expected.maxPayload) throw new ProtocolError("Chunk too large");
  if (header.offset + payload.byteLength > expected.fileSize) {
    throw new ProtocolError("Chunk exceeds declared file size");
  }
}

export interface ChunkSpan {
  chunkIndex: number;
  offset: number;
  length: number;
}

/** Number of chunks a file of `size` bytes is split into (0 for empty files). */
export function chunkCount(size: number, chunkSize: number): number {
  return size === 0 ? 0 : Math.ceil(size / chunkSize);
}

/** Lazily enumerate chunk boundaries for a file. */
export function* planChunks(size: number, chunkSize: number): Generator<ChunkSpan> {
  if (chunkSize <= 0) throw new RangeError("chunkSize must be positive");
  let chunkIndex = 0;
  for (let offset = 0; offset < size; offset += chunkSize) {
    yield { chunkIndex, offset, length: Math.min(chunkSize, size - offset) };
    chunkIndex += 1;
  }
}

export function encodeControl(message: ControlMessage): string {
  return JSON.stringify(message);
}
