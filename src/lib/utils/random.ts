/**
 * Randomness helpers built on `crypto.getRandomValues`, which (unlike
 * `crypto.randomUUID`) is also available on plain-HTTP LAN origins and in Node.
 */

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe random token; 32 bytes ≈ 256 bits of entropy. */
export function randomToken(byteLength = 32): string {
  return toBase64Url(randomBytes(byteLength));
}

/** Unbiased random integer in [0, maxExclusive). */
export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError("maxExclusive must be an integer in (0, 2^32]");
  }
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }
}

/** Short opaque identifier for client-side bookkeeping (not a secret). */
export function randomId(): string {
  return randomToken(9);
}
