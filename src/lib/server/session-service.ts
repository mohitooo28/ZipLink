import "server-only";
import type {
  ApiErrorCode,
  CreateSessionResponse,
  HeartbeatResponse,
  JoinSessionResponse,
  PendingRequestSummary,
  RequestStatus,
  RequestStatusResponse,
  RespondResponse,
  ServerSessionStatus,
} from "@/types/session";
import type { SignalMessage } from "@/types/signaling";
import { generateSessionCode, isValidSessionCode } from "@/lib/utils/generate-session-code";
import { randomToken } from "@/lib/utils/random";
import type { ServerConfig } from "./config";
import { hashSecret, rateLimitKey, secretMatches } from "./crypto";
import { deviceLabelFromUserAgent } from "./device-label";
import { buildIceServers } from "./ice-servers";
import type { SignalHub } from "./signal-hub";

/**
 * Session coordination: code reservation, join requests, sender approval and
 * expiry. All state lives in this process. Node runs this code on a single
 * thread and every mutation below is synchronous, so check-and-set sequences
 * (e.g. reserving a code, locking a session) are atomic.
 */

export interface SessionRecord {
  id: string;
  code: string;
  tokenHash: string;
  senderSecretHash: string;
  senderChannel: string;
  status: ServerSessionStatus;
  acceptedRequestId: string | null;
  createdAt: number;
  joinDeadline: number;
  expiresAt: number;
  closedAt: number | null;
  /** Whether the session ended by timing out or was closed by the sender. */
  closedReason: "expired" | "closed" | null;
}

export interface JoinRequestRecord {
  id: string;
  sessionId: string;
  channel: string;
  receiverSecretHash: string;
  deviceLabel: string;
  status: RequestStatus;
  createdAt: number;
}

export interface ClientContext {
  ip: string;
  userAgent: string | null;
}

export class ServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface SessionServiceDeps {
  config: ServerConfig;
  hub: SignalHub;
  now?: () => number;
  generateCode?: () => string;
}

const MAX_CODE_ATTEMPTS = 12;
const PURGE_INTERVAL_MS = 15_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const notFound = () =>
  new ServiceError("not_found", "No active session matches this code.", 404);

export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionsByCode = new Map<string, string>();
  private readonly requests = new Map<string, JoinRequestRecord>();
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private lastPurge = 0;

  private readonly config: ServerConfig;
  private readonly hub: SignalHub;
  private readonly now: () => number;
  private readonly generateCode: () => string;

  constructor(deps: SessionServiceDeps) {
    this.config = deps.config;
    this.hub = deps.hub;
    this.now = deps.now ?? Date.now;
    this.generateCode = deps.generateCode ?? generateSessionCode;
  }

  // ---------------------------------------------------------------- sender

  createSession(ctx: ClientContext): CreateSessionResponse {
    const now = this.now();
    this.purge(now);
    this.consumeRate("create", ctx.ip, this.config.createLimit, "Too many sessions created. Try again later.");

    const token = randomToken(32);
    const senderSecret = randomToken(32);
    const record: Omit<SessionRecord, "code"> = {
      id: randomToken(16),
      tokenHash: hashSecret(token),
      senderSecretHash: hashSecret(senderSecret),
      senderChannel: randomToken(16),
      status: "waiting",
      acceptedRequestId: null,
      createdAt: now,
      joinDeadline: now + this.config.joinWindowMs,
      expiresAt: now + this.config.leaseMs,
      closedAt: null,
      closedReason: null,
    };

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.generateCode();
      if (!isValidSessionCode(code) || !this.reserveCode(code, record.id, now)) continue;

      const session: SessionRecord = { ...record, code };
      this.sessions.set(session.id, session);
      this.hub.register(session.senderChannel, "sender");
      return {
        sessionId: session.id,
        code,
        token,
        senderSecret,
        senderChannel: session.senderChannel,
        expiresAt: session.expiresAt,
        joinDeadline: session.joinDeadline,
        heartbeatIntervalMs: this.config.heartbeatIntervalMs,
        iceServers: buildIceServers(this.config, now),
      };
    }
    throw new ServiceError("conflict", "Could not allocate a free code. Please try again.", 503);
  }

  heartbeat(sessionId: string, senderSecret: unknown): HeartbeatResponse {
    const now = this.now();
    this.purge(now);
    const session = this.authorizeSender(sessionId, senderSecret);
    const status = this.refreshStatus(session, now);

    if (status === "waiting" || status === "locked") {
      session.expiresAt = now + this.config.leaseMs;
    }
    return {
      status,
      expiresAt: session.expiresAt,
      joinDeadline: session.joinDeadline,
      requests: status === "waiting" ? this.pendingRequests(session.id) : [],
    };
  }

  respond(
    sessionId: string,
    senderSecret: unknown,
    requestId: unknown,
    decision: unknown,
  ): RespondResponse {
    const now = this.now();
    const session = this.authorizeSender(sessionId, senderSecret);
    if (decision !== "accept" && decision !== "reject") {
      throw new ServiceError("invalid_input", "Decision must be accept or reject.", 400);
    }
    const request = typeof requestId === "string" ? this.requests.get(requestId) : undefined;
    if (!request || request.sessionId !== session.id) {
      throw new ServiceError("not_found", "This request no longer exists.", 404);
    }
    if (request.status !== "pending") {
      throw new ServiceError("conflict", `This request was already ${request.status}.`, 409);
    }

    const status = this.refreshStatus(session, now);
    if (status === "closed" || status === "expired") {
      throw new ServiceError("expired", "This session has expired.", 410);
    }

    if (decision === "reject") {
      request.status = "rejected";
      this.publish(request.channel, {
        v: 1,
        type: "reject",
        from: "server",
        requestId: request.id,
        reason: "The sender declined this request.",
      });
      return { status: "rejected" };
    }

    if (session.status !== "waiting") {
      throw new ServiceError("session_busy", "This session is already connected to another device.", 409);
    }
    session.status = "locked";
    session.acceptedRequestId = request.id;
    session.expiresAt = now + this.config.leaseMs;
    request.status = "accepted";
    this.publish(request.channel, { v: 1, type: "accept", from: "server", requestId: request.id });

    for (const other of this.requests.values()) {
      if (other.sessionId === session.id && other.status === "pending") {
        other.status = "rejected";
        this.publish(other.channel, {
          v: 1,
          type: "reject",
          from: "server",
          requestId: other.id,
          reason: "The sender is already sharing with another device.",
        });
      }
    }
    return { status: "accepted", channel: request.channel };
  }

  closeSession(sessionId: string, senderSecret: unknown, reason = "The sender ended the session."): void {
    const session = this.authorizeSender(sessionId, senderSecret);
    this.close(session, this.now(), reason, "closed");
  }

  // -------------------------------------------------------------- receiver

  joinSession(input: { code?: unknown; token?: unknown }, ctx: ClientContext): JoinSessionResponse {
    const now = this.now();
    this.purge(now);

    const failureKey = rateLimitKey("join-fail", ctx.ip, this.config.rateLimitSalt);
    this.assertNotLimited(failureKey, this.config.joinFailureLimit, now);

    const { code, token } = input;
    if (!isValidSessionCode(code)) {
      throw new ServiceError("invalid_input", "Enter the 5-digit code shown on the sender's screen.", 400);
    }
    const hasToken = token !== undefined && token !== null && token !== "";
    if (hasToken && (typeof token !== "string" || !TOKEN_PATTERN.test(token))) {
      this.hit(failureKey, now);
      throw new ServiceError("expired", "This invitation link is invalid or has expired.", 410);
    }

    const sessionId = this.sessionsByCode.get(code);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    const status = session ? this.refreshStatus(session, now) : null;

    if (!session || status === "closed" || status === "expired") {
      this.hit(failureKey, now);
      if (hasToken) {
        throw new ServiceError("expired", "This invitation link is invalid or has expired.", 410);
      }
      throw notFound();
    }
    if (hasToken && !secretMatches(token, session.tokenHash)) {
      this.hit(failureKey, now);
      throw new ServiceError("expired", "This invitation link is invalid or has expired.", 410);
    }
    if (status === "locked") {
      throw new ServiceError("session_busy", "This session is already connected to another device.", 409);
    }
    if (this.pendingRequests(session.id).length >= this.config.maxPendingRequests) {
      throw new ServiceError("session_busy", "The sender has too many pending requests. Try again shortly.", 429);
    }

    const receiverSecret = randomToken(32);
    const request: JoinRequestRecord = {
      id: randomToken(16),
      sessionId: session.id,
      channel: randomToken(16),
      receiverSecretHash: hashSecret(receiverSecret),
      deviceLabel: deviceLabelFromUserAgent(ctx.userAgent),
      status: "pending",
      createdAt: now,
    };
    this.requests.set(request.id, request);
    this.hub.register(request.channel, "request");
    this.publish(session.senderChannel, {
      v: 1,
      type: "join-request",
      from: "server",
      request: this.summarize(request),
    });

    return {
      sessionId: session.id,
      requestId: request.id,
      receiverSecret,
      channel: request.channel,
      iceServers: buildIceServers(this.config, now),
    };
  }

  requestStatus(requestId: string, receiverSecret: unknown): RequestStatusResponse {
    const now = this.now();
    this.purge(now);
    const request = this.authorizeReceiver(requestId, receiverSecret);
    if (request.status === "pending") {
      const session = this.sessions.get(request.sessionId);
      const status = session ? this.refreshStatus(session, now) : "expired";
      if (status === "closed" || status === "expired") return { status: "expired" };
    }
    return { status: request.status };
  }

  cancelRequest(requestId: string, receiverSecret: unknown): void {
    const request = this.authorizeReceiver(requestId, receiverSecret);
    if (request.status !== "pending") return;
    request.status = "cancelled";
    const session = this.sessions.get(request.sessionId);
    if (session) {
      this.publish(session.senderChannel, {
        v: 1,
        type: "request-cancelled",
        from: "server",
        requestId: request.id,
      });
    }
  }

  // ------------------------------------------------------------- internals

  /** Channel publish for messages coming from browsers (request channels only). */
  publishFromClient(channel: string, message: SignalMessage): boolean {
    if (message.from === "server" || this.hub.kindOf(channel) !== "request") return false;
    return this.hub.publish(channel, message);
  }

  private publish(channel: string, message: SignalMessage): void {
    this.hub.publish(channel, message);
  }

  private summarize(request: JoinRequestRecord): PendingRequestSummary {
    return { requestId: request.id, deviceLabel: request.deviceLabel, createdAt: request.createdAt };
  }

  private pendingRequests(sessionId: string): PendingRequestSummary[] {
    const pending: PendingRequestSummary[] = [];
    for (const request of this.requests.values()) {
      if (request.sessionId === sessionId && request.status === "pending") {
        pending.push(this.summarize(request));
      }
    }
    return pending.sort((a, b) => a.createdAt - b.createdAt);
  }

  private authorizeSender(sessionId: string, secret: unknown): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session || !secretMatches(secret, session.senderSecretHash)) {
      throw new ServiceError("unauthorized", "Session not found or access denied.", 404);
    }
    return session;
  }

  private authorizeReceiver(requestId: string, secret: unknown): JoinRequestRecord {
    const request = this.requests.get(requestId);
    if (!request || !secretMatches(secret, request.receiverSecretHash)) {
      throw new ServiceError("unauthorized", "Request not found or access denied.", 404);
    }
    return request;
  }

  /** Apply time-based expiry and return the effective status. */
  private refreshStatus(session: SessionRecord, now: number): ServerSessionStatus | "expired" {
    if (session.status === "closed") return session.closedReason === "expired" ? "expired" : "closed";
    const leaseExpired = session.expiresAt <= now;
    const joinWindowOver = session.status === "waiting" && session.joinDeadline <= now;
    if (leaseExpired || joinWindowOver) {
      // Expiry is detected lazily; record when it actually happened.
      const expiredAt = Math.min(
        leaseExpired ? session.expiresAt : Number.POSITIVE_INFINITY,
        joinWindowOver ? session.joinDeadline : Number.POSITIVE_INFINITY,
      );
      this.close(session, expiredAt, "This session has expired.", "expired");
      return "expired";
    }
    return session.status;
  }

  private close(session: SessionRecord, at: number, reason: string, kind: "expired" | "closed"): void {
    if (session.status === "closed") return;
    session.status = "closed";
    session.closedAt = at;
    session.closedReason = kind;
    // Free the code immediately so it can be handed out again.
    if (this.sessionsByCode.get(session.code) === session.id) this.sessionsByCode.delete(session.code);
    for (const request of this.requests.values()) {
      if (request.sessionId === session.id && request.status === "pending") {
        this.publish(request.channel, { v: 1, type: "session-closed", from: "server", reason });
      }
    }
  }

  /** Atomically claim a code; succeeds only if no live session holds it. */
  private reserveCode(code: string, sessionId: string, now: number): boolean {
    const holderId = this.sessionsByCode.get(code);
    if (holderId) {
      const holder = this.sessions.get(holderId);
      // refreshStatus closes (and releases) the holder if it has expired.
      if (holder) this.refreshStatus(holder, now);
      if (holder && holder.status !== "closed") return false;
    }
    this.sessionsByCode.set(code, sessionId);
    return true;
  }

  private purge(now: number): void {
    if (now - this.lastPurge < PURGE_INTERVAL_MS) return;
    this.lastPurge = now;

    for (const session of this.sessions.values()) {
      this.refreshStatus(session, now);
      if (session.closedAt !== null && session.closedAt + this.config.retentionMs <= now) {
        this.sessions.delete(session.id);
        this.hub.unregister(session.senderChannel);
        for (const request of this.requests.values()) {
          if (request.sessionId === session.id) {
            this.requests.delete(request.id);
            this.hub.unregister(request.channel);
          }
        }
      }
    }
    for (const [key, entry] of this.rateLimits) {
      if (entry.windowStart + this.config.rateWindowMs <= now) this.rateLimits.delete(key);
    }
  }

  private hit(key: string, now: number): number {
    const entry = this.rateLimits.get(key);
    if (!entry || entry.windowStart + this.config.rateWindowMs <= now) {
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  private assertNotLimited(key: string, limit: number, now: number): void {
    const entry = this.rateLimits.get(key);
    if (entry && entry.windowStart + this.config.rateWindowMs > now && entry.count >= limit) {
      const retryAfterSeconds = Math.ceil((entry.windowStart + this.config.rateWindowMs - now) / 1000);
      throw new ServiceError(
        "rate_limited",
        "Too many incorrect attempts. Please wait before trying again.",
        429,
        retryAfterSeconds,
      );
    }
  }

  private consumeRate(scope: string, ip: string, limit: number, message: string): void {
    const now = this.now();
    const key = rateLimitKey(scope, ip, this.config.rateLimitSalt);
    const entry = this.rateLimits.get(key);
    if (entry && entry.windowStart + this.config.rateWindowMs > now && entry.count >= limit) {
      const retryAfterSeconds = Math.ceil((entry.windowStart + this.config.rateWindowMs - now) / 1000);
      throw new ServiceError("rate_limited", message, 429, retryAfterSeconds);
    }
    this.hit(key, now);
  }
}
