import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Secrets are only ever stored as SHA-256 digests. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("base64url");
}

export function secretMatches(secret: unknown, expectedHash: string): boolean {
  if (typeof secret !== "string" || secret.length === 0 || secret.length > 256) return false;
  const actual = Buffer.from(hashSecret(secret));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Opaque, salted key for rate limiting so raw IPs are never retained. */
export function rateLimitKey(scope: string, ip: string, salt: string): string {
  return `${scope}:${createHash("sha256").update(`${salt}:${ip}`).digest("base64url").slice(0, 22)}`;
}

/** Time-limited TURN credentials (coturn `use-auth-secret` / TURN REST API). */
export function turnRestCredentials(
  secret: string,
  ttlSeconds: number,
  now: number,
  label = "ziplink",
): { username: string; credential: string } {
  const username = `${Math.floor(now / 1000) + ttlSeconds}:${label}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}
