import { randomInt } from "./random";

export const SESSION_CODE_LENGTH = 5;
const CODE_SPACE = 10 ** SESSION_CODE_LENGTH;
const CODE_PATTERN = /^\d{5}$/;

/**
 * Five-digit numeric code (leading zeros allowed). The code is only a
 * convenience for humans; uniqueness is enforced by the store and secrecy by
 * the invitation token and rate limiting.
 */
export function generateSessionCode(): string {
  return String(randomInt(CODE_SPACE)).padStart(SESSION_CODE_LENGTH, "0");
}

export function isValidSessionCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

/** Keep only digits, capped to the code length — used for pasted input. */
export function normalizeCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, SESSION_CODE_LENGTH);
}
