import type { ControlMessage, ManifestFile } from "@/types/transfer";
import type { PendingRequestSummary } from "@/types/session";
import type { SignalMessage } from "@/types/signaling";

/**
 * Defensive parsers for everything that arrives from another client.
 * Each returns `null` for anything malformed instead of throwing, so a bad
 * message can be dropped without corrupting transfer state.
 */

type Json = Record<string, unknown>;

const MAX_SDP_LENGTH = 64 * 1024;
const MAX_CANDIDATES_PER_MESSAGE = 64;
const MAX_REASON_LENGTH = 200;
export const MAX_MANIFEST_FILES = 10_000;
export const MAX_FILE_NAME_LENGTH = 1024;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, max = 1024): value is string {
  return typeof value === "string" && value.length <= max;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isReason(value: unknown): value is string {
  return isString(value, MAX_REASON_LENGTH);
}

function isCandidate(value: unknown): value is RTCIceCandidateInit {
  if (!isObject(value)) return false;
  if (!isString(value.candidate, 2048)) return false;
  if (value.sdpMid !== undefined && value.sdpMid !== null && !isString(value.sdpMid, 64)) return false;
  if (
    value.sdpMLineIndex !== undefined &&
    value.sdpMLineIndex !== null &&
    !isNonNegativeInt(value.sdpMLineIndex)
  ) {
    return false;
  }
  return true;
}

function isRequestSummary(value: unknown): value is PendingRequestSummary {
  return (
    isObject(value) &&
    isString(value.requestId, 128) &&
    isString(value.deviceLabel, 128) &&
    isNonNegativeInt(value.createdAt)
  );
}

export function parseSignalMessage(value: unknown): SignalMessage | null {
  if (!isObject(value) || value.v !== 1 || typeof value.type !== "string") return null;
  const { type, from } = value;

  switch (type) {
    case "join-request":
      return from === "server" && isRequestSummary(value.request)
        ? { v: 1, type, from, request: value.request }
        : null;
    case "request-cancelled":
      return from === "server" && isString(value.requestId, 128)
        ? { v: 1, type, from, requestId: value.requestId }
        : null;
    case "accept":
    case "reject":
      if (from !== "server" || !isString(value.requestId, 128)) return null;
      if (value.reason !== undefined && !isReason(value.reason)) return null;
      return { v: 1, type, from, requestId: value.requestId, reason: value.reason };
    case "session-closed":
      return from === "server" && isReason(value.reason)
        ? { v: 1, type, from, reason: value.reason }
        : null;
    case "ready":
      return from === "receiver" ? { v: 1, type, from } : null;
    case "offer":
      return from === "sender" &&
        isString(value.sdp, MAX_SDP_LENGTH) &&
        isNonNegativeInt(value.attempt)
        ? { v: 1, type, from, sdp: value.sdp, attempt: value.attempt }
        : null;
    case "answer":
      return from === "receiver" &&
        isString(value.sdp, MAX_SDP_LENGTH) &&
        isNonNegativeInt(value.attempt)
        ? { v: 1, type, from, sdp: value.sdp, attempt: value.attempt }
        : null;
    case "ice": {
      if (from !== "sender" && from !== "receiver") return null;
      const { candidates } = value;
      if (
        !Array.isArray(candidates) ||
        candidates.length > MAX_CANDIDATES_PER_MESSAGE ||
        !candidates.every(isCandidate)
      ) {
        return null;
      }
      return { v: 1, type, from, candidates };
    }
    case "cancel":
      return (from === "sender" || from === "receiver") && isReason(value.reason)
        ? { v: 1, type, from, reason: value.reason }
        : null;
    default:
      return null;
  }
}

function parseManifestFile(value: unknown, expectedIndex: number): ManifestFile | null {
  if (!isObject(value)) return null;
  const { index, name, size, type, lastModified } = value;
  if (index !== expectedIndex) return null;
  if (!isString(name, MAX_FILE_NAME_LENGTH) || name.length === 0) return null;
  if (!isNonNegativeInt(size)) return null;
  if (!isString(type, 256)) return null;
  if (!isNonNegativeInt(lastModified)) return null;
  return { index, name, size, type, lastModified };
}

export function parseControlMessage(raw: string): ControlMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.t !== "string") return null;

  switch (value.t) {
    case "manifest": {
      const { transferId, files, totalBytes, chunkSize } = value;
      if (!isNonNegativeInt(transferId) || transferId > 0xffffffff) return null;
      if (!isNonNegativeInt(totalBytes) || !isNonNegativeInt(chunkSize) || chunkSize === 0) {
        return null;
      }
      if (!Array.isArray(files) || files.length === 0 || files.length > MAX_MANIFEST_FILES) {
        return null;
      }
      const parsed: ManifestFile[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = parseManifestFile(files[i], i);
        if (!file) return null;
        parsed.push(file);
      }
      const sum = parsed.reduce((acc, file) => acc + file.size, 0);
      if (sum !== totalBytes) return null;
      return { t: "manifest", transferId, files: parsed, totalBytes, chunkSize };
    }
    case "start":
    case "done":
    case "done-ack":
      return { t: value.t };
    case "file-start":
    case "file-done":
      return isNonNegativeInt(value.index) ? { t: value.t, index: value.index } : null;
    case "file-end":
      return isNonNegativeInt(value.index) && isNonNegativeInt(value.size)
        ? { t: "file-end", index: value.index, size: value.size }
        : null;
    case "progress":
      return isNonNegativeInt(value.written) &&
        isNonNegativeInt(value.index) &&
        isNonNegativeInt(value.fileWritten)
        ? {
            t: "progress",
            written: value.written,
            index: value.index,
            fileWritten: value.fileWritten,
          }
        : null;
    case "cancel":
      return isReason(value.reason) ? { t: "cancel", reason: value.reason } : null;
    default:
      return null;
  }
}
