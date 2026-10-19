import type {
  ApiErrorBody,
  ApiErrorCode,
  CreateSessionResponse,
  HeartbeatResponse,
  JoinSessionResponse,
  RequestStatusResponse,
  RespondResponse,
  ServiceStatusResponse,
} from "@/types/session";

/** Typed client for the session API. */

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "network",
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("network", "Couldn't reach ZipLink. Check your connection and try again.", 0);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON responses are handled below.
  }
  if (!response.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      error?.code ?? "internal",
      error?.message ?? `Request failed (${response.status}).`,
      response.status,
      error?.retryAfterSeconds,
    );
  }
  return payload as T;
}

export interface SenderCredentials {
  sessionId: string;
  senderSecret: string;
}

export interface ReceiverCredentials {
  requestId: string;
  receiverSecret: string;
}

const enc = encodeURIComponent;

export const sessionApi = {
  status: () => request<ServiceStatusResponse>("GET", "/api/status"),

  createSession: () => request<CreateSessionResponse>("POST", "/api/sessions"),

  heartbeat: ({ sessionId, senderSecret }: SenderCredentials) =>
    request<HeartbeatResponse>("POST", `/api/sessions/${enc(sessionId)}/heartbeat`, { senderSecret }),

  respond: (
    { sessionId, senderSecret }: SenderCredentials,
    requestId: string,
    decision: "accept" | "reject",
  ) =>
    request<RespondResponse>("POST", `/api/sessions/${enc(sessionId)}/respond`, {
      senderSecret,
      requestId,
      decision,
    }),

  closeSession: ({ sessionId, senderSecret }: SenderCredentials) =>
    request<{ ok: true }>("POST", `/api/sessions/${enc(sessionId)}/close`, { senderSecret }),

  /** Fire-and-forget close that survives the page being unloaded. */
  closeSessionBeacon({ sessionId, senderSecret }: SenderCredentials): void {
    const url = `/api/sessions/${enc(sessionId)}/close`;
    const body = JSON.stringify({ senderSecret });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, body)) return;
    void fetch(url, { method: "POST", body, keepalive: true }).catch(() => undefined);
  },

  joinSession: (code: string, token?: string) =>
    request<JoinSessionResponse>("POST", "/api/sessions/join", { code, token: token || undefined }),

  requestStatus: ({ requestId, receiverSecret }: ReceiverCredentials) =>
    request<RequestStatusResponse>("POST", `/api/requests/${enc(requestId)}`, { receiverSecret }),

  cancelRequest: ({ requestId, receiverSecret }: ReceiverCredentials) =>
    request<{ ok: true }>("POST", `/api/requests/${enc(requestId)}/cancel`, { receiverSecret }),

  cancelRequestBeacon({ requestId, receiverSecret }: ReceiverCredentials): void {
    const url = `/api/requests/${enc(requestId)}/cancel`;
    const body = JSON.stringify({ receiverSecret });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(url, body)) return;
    void fetch(url, { method: "POST", body, keepalive: true }).catch(() => undefined);
  },
};
