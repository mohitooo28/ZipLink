import { describe, expect, it } from "vitest";
import {
  assertExpectedChunk,
  chunkCount,
  decodeChunk,
  DEFAULT_CHUNK_SIZE,
  encodeChunk,
  HEADER_BYTES,
  MIN_CHUNK_SIZE,
  negotiateChunkSize,
  planChunks,
  ProtocolError,
} from "@/lib/transfer/chunk-protocol";

describe("chunk framing", () => {
  it("round-trips header and payload, including offsets above 4 GiB", () => {
    const payload = new Uint8Array([1, 2, 3, 250]);
    const offset = 5 * 2 ** 32 + 12345;
    const buffer = encodeChunk({ transferId: 0xfffffffe, fileIndex: 7, chunkIndex: 99, offset }, payload);
    expect(buffer.byteLength).toBe(HEADER_BYTES + 4);
    const decoded = decodeChunk(buffer);
    expect(decoded.header).toEqual({ transferId: 0xfffffffe, fileIndex: 7, chunkIndex: 99, offset });
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 250]);
  });

  it("rejects truncated or foreign messages", () => {
    expect(() => decodeChunk(new ArrayBuffer(10))).toThrow(ProtocolError);
    const bad = encodeChunk({ transferId: 1, fileIndex: 0, chunkIndex: 0, offset: 0 }, new Uint8Array(1));
    new DataView(bad).setUint8(0, 9);
    expect(() => decodeChunk(bad)).toThrow(/Unknown binary message kind/);
    const badVersion = encodeChunk({ transferId: 1, fileIndex: 0, chunkIndex: 0, offset: 0 }, new Uint8Array(1));
    new DataView(badVersion).setUint8(1, 42);
    expect(() => decodeChunk(badVersion)).toThrow(/Unsupported protocol version/);
  });
});

describe("chunk validation", () => {
  const expected = { transferId: 1, fileIndex: 2, chunkIndex: 3, offset: 300, fileSize: 400, maxPayload: 100 };
  const make = (overrides: Partial<{ transferId: number; fileIndex: number; chunkIndex: number; offset: number }>, length = 100) =>
    decodeChunk(
      encodeChunk({ transferId: 1, fileIndex: 2, chunkIndex: 3, offset: 300, ...overrides }, new Uint8Array(length)),
    );

  it("accepts exactly the next chunk", () => {
    expect(() => assertExpectedChunk(make({}), expected)).not.toThrow();
  });

  it.each([
    [{ transferId: 9 }, 100, /another transfer/],
    [{ fileIndex: 1 }, 100, /unexpected file/],
    [{ chunkIndex: 4 }, 100, /out of order/],
    [{ offset: 200 }, 100, /offset mismatch/],
    [{}, 0, /Empty chunk/],
    [{}, 101, /too large/],
  ])("rejects %o (len %d)", (overrides, length, message) => {
    expect(() => assertExpectedChunk(make(overrides, length), expected)).toThrow(message);
  });

  it("rejects data beyond the declared file size", () => {
    expect(() => assertExpectedChunk(make({}, 100), { ...expected, fileSize: 350 })).toThrow(/exceeds declared/);
  });
});

describe("chunk planning", () => {
  it("handles zero-byte files", () => {
    expect([...planChunks(0, 64)]).toEqual([]);
    expect(chunkCount(0, 64)).toBe(0);
  });

  it("handles exact multiples and partial last chunks", () => {
    expect([...planChunks(128, 64)].map((c) => c.length)).toEqual([64, 64]);
    const spans = [...planChunks(130, 64)];
    expect(spans).toEqual([
      { chunkIndex: 0, offset: 0, length: 64 },
      { chunkIndex: 1, offset: 64, length: 64 },
      { chunkIndex: 2, offset: 128, length: 2 },
    ]);
    expect(chunkCount(130, 64)).toBe(3);
    expect([...planChunks(1, 64)]).toEqual([{ chunkIndex: 0, offset: 0, length: 1 }]);
  });

  it("negotiates chunk size within the SCTP message limit", () => {
    expect(negotiateChunkSize(undefined)).toBe(DEFAULT_CHUNK_SIZE);
    expect(negotiateChunkSize(262_144)).toBe(DEFAULT_CHUNK_SIZE);
    expect(negotiateChunkSize(65_536)).toBe(65_536 - HEADER_BYTES);
    expect(negotiateChunkSize(1000)).toBe(MIN_CHUNK_SIZE);
    expect(negotiateChunkSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CHUNK_SIZE);
  });
});
