import { beforeEach, describe, expect, it } from "vitest";
import type { ServerConfig } from "@/lib/server/config";
import { ServiceError, SessionService } from "@/lib/server/session-service";
import { SignalHub, type HubMessage } from "@/lib/server/signal-hub";

const config: ServerConfig = {
  joinWindowMs: 30 * 60_000,
  leaseMs: 120_000,
  heartbeatIntervalMs: 5_000,
  retentionMs: 10 * 60_000,
  maxPendingRequests: 3,
  joinFailureLimit: 4,
  createLimit: 100,
  rateWindowMs: 10 * 60_000,
  rateLimitSalt: "test",
  stunUrls: ["stun:stun.example.org:3478"],
  turnUrls: ["turn:turn.example.org:3478"],
  turnUsername: null,
  turnCredential: null,
  turnSecret: "shared-secret",
  turnTtlSeconds: 3600,
};

const sender = { ip: "10.0.0.1", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36" };
const receiver = { ip: "10.0.0.2", userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36" };

let now = 1_000_000;
let hub: SignalHub;
let service: SessionService;

function setup(generateCode?: () => string) {
  now = 1_000_000;
  hub = new SignalHub(() => now);
  service = new SessionService({ config, hub, now: () => now, generateCode });
}

function collect(channel: string): HubMessage[] {
  const messages: HubMessage[] = [];
  const result = hub.subscribe(channel, (message) => messages.push(message), () => undefined);
  expect(typeof result).toBe("function");
  return messages;
}

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return error as ServiceError;
  }
  throw new Error(`expected ${code}`);
}

beforeEach(() => setup());

describe("code reservation", () => {
  it("creates a session with a five-digit code, secrets and ICE servers", () => {
    const created = service.createSession(sender);
    expect(created.code).toMatch(/^\d{5}$/);
    expect(created.token.length).toBeGreaterThanOrEqual(40);
    expect(created.senderSecret).not.toBe(created.token);
    expect(created.iceServers[0]).toEqual({ urls: config.stunUrls });
    expect(created.iceServers[1]).toMatchObject({ urls: config.turnUrls, username: expect.stringContaining(":ziplink") });
  });

  it("retries on collisions and never hands out an active code twice", () => {
    const sequence = ["11111", "11111", "11111", "22222"];
    setup(() => sequence.shift() ?? "33333");
    const first = service.createSession(sender);
    const second = service.createSession(sender);
    expect(first.code).toBe("11111");
    expect(second.code).toBe("22222");
  });

  it("fails cleanly when no free code can be found", () => {
    setup(() => "44444");
    service.createSession(sender);
    expectError(() => service.createSession(sender), "conflict");
  });

  it("reuses codes once the holding session has closed or expired", () => {
    setup(() => "55555");
    const first = service.createSession(sender);
    service.closeSession(first.sessionId, first.senderSecret);
    expect(service.createSession(sender).code).toBe("55555");
    now += config.leaseMs + 1; // second session's lease runs out without heartbeats
    expect(service.createSession(sender).code).toBe("55555");
  });

  it("many concurrent sessions all receive distinct codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 80; i += 1) codes.add(service.createSession(sender).code);
    expect(codes.size).toBe(80);
  });
});

describe("joining", () => {
  it("lets a receiver join by code and notifies the sender", () => {
    const created = service.createSession(sender);
    const senderMessages = collect(created.senderChannel);
    const joined = service.joinSession({ code: created.code }, receiver);
    expect(joined.sessionId).toBe(created.sessionId);
    expect(joined.channel).not.toBe(created.senderChannel);
    expect(senderMessages).toHaveLength(1);
    const payload = JSON.parse(senderMessages[0].data);
    expect(payload).toMatchObject({ type: "join-request", request: { requestId: joined.requestId, deviceLabel: "Chrome on Android" } });
    expect(service.heartbeat(created.sessionId, created.senderSecret).requests).toHaveLength(1);
  });

  it("validates codes and invitation tokens", () => {
    const created = service.createSession(sender);
    expectError(() => service.joinSession({ code: "12" }, receiver), "invalid_input");
    expectError(() => service.joinSession({ code: created.code, token: "x".repeat(43) }, receiver), "expired");
    expect(service.joinSession({ code: created.code, token: created.token }, receiver).requestId).toBeTruthy();
  });

  it("rate-limits repeated wrong codes per client", () => {
    const created = service.createSession(sender);
    const wrong = created.code === "00000" ? "00001" : "00000";
    for (let i = 0; i < config.joinFailureLimit; i += 1) {
      expectError(() => service.joinSession({ code: wrong }, receiver), "not_found");
    }
    const limited = expectError(() => service.joinSession({ code: created.code }, receiver), "rate_limited");
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    // A different client is unaffected.
    expect(service.joinSession({ code: created.code }, { ...receiver, ip: "10.0.0.3" }).requestId).toBeTruthy();
    now += config.rateWindowMs + 1;
    const fresh = service.createSession(sender);
    expect(service.joinSession({ code: fresh.code }, receiver).requestId).toBeTruthy();
  });

  it("caps pending requests per session", () => {
    const created = service.createSession(sender);
    for (let i = 0; i < config.maxPendingRequests; i += 1) service.joinSession({ code: created.code }, receiver);
    expectError(() => service.joinSession({ code: created.code }, receiver), "session_busy");
  });

  it("refuses joins after the join window or lease has expired", () => {
    const created = service.createSession(sender);
    now += config.leaseMs + 1;
    expectError(() => service.joinSession({ code: created.code }, receiver), "not_found");
    expectError(() => service.joinSession({ code: created.code, token: created.token }, receiver), "expired");

    const again = service.createSession(sender);
    // Heartbeats keep the lease alive, but the join window still closes.
    for (let minute = 1; minute < 30; minute += 1) {
      now += 60_000;
      expect(service.heartbeat(again.sessionId, again.senderSecret).status).toBe("waiting");
    }
    now += 60_001;
    expect(service.heartbeat(again.sessionId, again.senderSecret).status).toBe("expired");
    expectError(() => service.joinSession({ code: again.code }, receiver), "not_found");
  });
});

describe("approval", () => {
  it("accepting locks the session, notifies the receiver and rejects the others", () => {
    const created = service.createSession(sender);
    const a = service.joinSession({ code: created.code }, receiver);
    const b = service.joinSession({ code: created.code }, { ...receiver, ip: "10.0.0.9" });
    const aMessages = collect(a.channel);
    const bMessages = collect(b.channel);

    const response = service.respond(created.sessionId, created.senderSecret, a.requestId, "accept");
    expect(response).toEqual({ status: "accepted", channel: a.channel });
    expect(JSON.parse(aMessages[0].data)).toMatchObject({ type: "accept" });
    expect(JSON.parse(bMessages[0].data)).toMatchObject({ type: "reject" });
    expect(service.requestStatus(b.requestId, b.receiverSecret).status).toBe("rejected");
    expect(service.requestStatus(a.requestId, a.receiverSecret).status).toBe("accepted");

    // Duplicate accepts and new joins are refused.
    expectError(() => service.respond(created.sessionId, created.senderSecret, a.requestId, "accept"), "conflict");
    expectError(() => service.joinSession({ code: created.code }, receiver), "session_busy");
  });

  it("rejection informs only that receiver and keeps the session open", () => {
    const created = service.createSession(sender);
    const joined = service.joinSession({ code: created.code }, receiver);
    const messages = collect(joined.channel);
    expect(service.respond(created.sessionId, created.senderSecret, joined.requestId, "reject").status).toBe("rejected");
    expect(JSON.parse(messages[0].data)).toMatchObject({ type: "reject" });
    expect(service.joinSession({ code: created.code }, receiver).requestId).toBeTruthy();
  });

  it("requires the sender secret", () => {
    const created = service.createSession(sender);
    const joined = service.joinSession({ code: created.code }, receiver);
    expectError(() => service.respond(created.sessionId, "wrong", joined.requestId, "accept"), "unauthorized");
    expectError(() => service.heartbeat(created.sessionId, created.token), "unauthorized");
    expectError(() => service.requestStatus(joined.requestId, created.senderSecret), "unauthorized");
  });
});

describe("cancellation and expiry", () => {
  it("receiver cancellation notifies the sender", () => {
    const created = service.createSession(sender);
    const senderMessages = collect(created.senderChannel);
    const joined = service.joinSession({ code: created.code }, receiver);
    service.cancelRequest(joined.requestId, joined.receiverSecret);
    expect(JSON.parse(senderMessages[1].data)).toMatchObject({ type: "request-cancelled", requestId: joined.requestId });
    expect(service.heartbeat(created.sessionId, created.senderSecret).requests).toHaveLength(0);
  });

  it("closing a session tells pending receivers and expires their requests", () => {
    const created = service.createSession(sender);
    const joined = service.joinSession({ code: created.code }, receiver);
    const messages = collect(joined.channel);
    service.closeSession(created.sessionId, created.senderSecret);
    expect(JSON.parse(messages[0].data)).toMatchObject({ type: "session-closed" });
    expect(service.requestStatus(joined.requestId, joined.receiverSecret).status).toBe("expired");
    expect(service.heartbeat(created.sessionId, created.senderSecret).status).toBe("closed");
  });

  it("abandoned sessions expire, are purged, and their channels removed", () => {
    const created = service.createSession(sender);
    const joined = service.joinSession({ code: created.code }, receiver);
    now += config.leaseMs + config.retentionMs + 60_000;
    service.createSession(sender); // triggers purge
    expect(hub.kindOf(created.senderChannel)).toBeNull();
    expect(hub.kindOf(joined.channel)).toBeNull();
    expectError(() => service.requestStatus(joined.requestId, joined.receiverSecret), "unauthorized");
  });

  it("clients cannot publish server messages or use sender channels", () => {
    const created = service.createSession(sender);
    const joined = service.joinSession({ code: created.code }, receiver);
    expect(service.publishFromClient(joined.channel, { v: 1, type: "ready", from: "receiver" })).toBe(true);
    expect(service.publishFromClient(joined.channel, { v: 1, type: "accept", from: "server", requestId: "x" })).toBe(false);
    expect(service.publishFromClient(created.senderChannel, { v: 1, type: "ready", from: "receiver" })).toBe(false);
    expect(service.publishFromClient("unknown-channel-name", { v: 1, type: "ready", from: "receiver" })).toBe(false);
  });
});

describe("signal hub", () => {
  it("replays the backlog to late subscribers and resumes after Last-Event-ID", () => {
    hub.register("chan-aaaaaaaaaaaaaaaa", "request");
    hub.publish("chan-aaaaaaaaaaaaaaaa", { n: 1 });
    hub.publish("chan-aaaaaaaaaaaaaaaa", { n: 2 });
    const all: HubMessage[] = [];
    hub.subscribe("chan-aaaaaaaaaaaaaaaa", (m) => all.push(m), () => undefined);
    expect(all.map((m) => JSON.parse(m.data).n)).toEqual([1, 2]);
    const resumed: HubMessage[] = [];
    hub.subscribe("chan-aaaaaaaaaaaaaaaa", (m) => resumed.push(m), () => undefined, all[0].id);
    expect(resumed.map((m) => JSON.parse(m.data).n)).toEqual([2]);
  });

  it("rejects unknown channels and caps subscribers; unregister closes streams", () => {
    expect(hub.subscribe("missing", () => undefined, () => undefined)).toBe("not_found");
    hub.register("chan-bbbbbbbbbbbbbbbb", "request");
    let closed = 0;
    for (let i = 0; i < 4; i += 1) hub.subscribe("chan-bbbbbbbbbbbbbbbb", () => undefined, () => (closed += 1));
    expect(hub.subscribe("chan-bbbbbbbbbbbbbbbb", () => undefined, () => undefined)).toBe("full");
    hub.unregister("chan-bbbbbbbbbbbbbbbb");
    expect(closed).toBe(4);
    expect(hub.publish("chan-bbbbbbbbbbbbbbbb", {})).toBe(false);
  });
});
