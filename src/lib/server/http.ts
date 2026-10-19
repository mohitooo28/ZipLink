import "server-only";
import type { ApiErrorBody } from "@/types/session";
import type { ClientContext } from "./session-service";
import { ServiceError } from "./session-service";

const MAX_BODY_BYTES = 96 * 1024;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ServiceError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds },
    };
    const headers: Record<string, string> = { ...NO_STORE };
    if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
    return Response.json(body, { status: error.status, headers });
  }
  if (process.env.NODE_ENV !== "production") console.error("[ziplink] unexpected API error", error);
  const body: ApiErrorBody = { error: { code: "internal", message: "Something went wrong. Please try again." } };
  return Response.json(body, { status: 500, headers: NO_STORE });
}

/**
 * Parse a small JSON body. Accepts `text/plain` too, because
 * `navigator.sendBeacon` cannot send `application/json` without a preflight.
 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new ServiceError("invalid_input", "Request too large.", 413);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ServiceError("invalid_input", "Request too large.", 413);
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new ServiceError("invalid_input", "Malformed request body.", 400);
}

export function clientContext(request: Request): ClientContext {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local";
  return { ip, userAgent: request.headers.get("user-agent") };
}
