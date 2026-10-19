import "server-only";

/** Server configuration, read from environment variables once per process. */

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface ServerConfig {
  /** How long a sender waits for a receiver before the code expires. */
  joinWindowMs: number;
  /** Session lease; renewed by sender heartbeats. */
  leaseMs: number;
  heartbeatIntervalMs: number;
  /** How long closed sessions are kept so late status polls get an answer. */
  retentionMs: number;
  maxPendingRequests: number;
  joinFailureLimit: number;
  createLimit: number;
  rateWindowMs: number;
  rateLimitSalt: string;
  stunUrls: string[];
  turnUrls: string[];
  turnUsername: string | null;
  turnCredential: string | null;
  turnSecret: string | null;
  turnTtlSeconds: number;
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;
  const stunFromEnv = process.env.STUN_URLS;
  cached = {
    joinWindowMs: intFromEnv("SESSION_WAIT_MINUTES", 30, 1, 24 * 60) * 60_000,
    leaseMs: 120_000,
    heartbeatIntervalMs: 5_000,
    retentionMs: 10 * 60_000,
    maxPendingRequests: 5,
    joinFailureLimit: intFromEnv("JOIN_FAILURE_LIMIT", 10, 1, 1000),
    createLimit: intFromEnv("CREATE_SESSION_LIMIT", 30, 1, 10_000),
    rateWindowMs: 10 * 60_000,
    rateLimitSalt: process.env.RATE_LIMIT_SALT ?? "ziplink",
    // An explicitly empty STUN_URLS disables STUN (LAN-only deployments).
    stunUrls:
      stunFromEnv === undefined
        ? ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"]
        : listFromEnv("STUN_URLS"),
    turnUrls: listFromEnv("TURN_URLS"),
    turnUsername: process.env.TURN_USERNAME || null,
    turnCredential: process.env.TURN_CREDENTIAL || null,
    turnSecret: process.env.TURN_SECRET || null,
    turnTtlSeconds: intFromEnv("TURN_TTL_SECONDS", 6 * 3600, 60, 7 * 24 * 3600),
  };
  return cached;
}

export function configIssues(config: ServerConfig): string[] {
  const issues: string[] = [];
  if (config.turnUrls.length > 0 && !config.turnSecret && !(config.turnUsername && config.turnCredential)) {
    issues.push("TURN_URLS is set but neither TURN_SECRET nor TURN_USERNAME/TURN_CREDENTIAL are configured; TURN is disabled.");
  }
  if (config.stunUrls.length === 0 && config.turnUrls.length === 0) {
    issues.push("No STUN or TURN servers configured; only devices on the same local network can connect.");
  }
  return issues;
}

export function isTurnConfigured(config: ServerConfig): boolean {
  return config.turnUrls.length > 0 && Boolean(config.turnSecret || (config.turnUsername && config.turnCredential));
}
