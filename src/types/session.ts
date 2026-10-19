/** Shapes shared between the session API (server) and the browser client. */

export type Role = "sender" | "receiver";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ServerSessionStatus = "waiting" | "locked" | "closed";

export type RequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired";

export interface PendingRequestSummary {
  requestId: string;
  /** Coarse, non-identifying description such as "Chrome on Android". */
  deviceLabel: string;
  createdAt: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  code: string;
  token: string;
  senderSecret: string;
  senderChannel: string;
  expiresAt: number;
  joinDeadline: number;
  heartbeatIntervalMs: number;
  iceServers: IceServerConfig[];
}

export interface JoinSessionResponse {
  sessionId: string;
  requestId: string;
  receiverSecret: string;
  channel: string;
  iceServers: IceServerConfig[];
}

export interface HeartbeatResponse {
  status: ServerSessionStatus | "expired";
  expiresAt: number;
  joinDeadline: number;
  requests: PendingRequestSummary[];
}

export interface RespondResponse {
  status: RequestStatus;
  /** Signaling channel shared with the accepted receiver. */
  channel?: string;
}

export interface RequestStatusResponse {
  status: RequestStatus;
}

export interface ServiceStatusResponse {
  ready: boolean;
  turnConfigured: boolean;
  issues: string[];
}

export type ApiErrorCode =
  | "invalid_input"
  | "not_found"
  | "expired"
  | "unauthorized"
  | "rate_limited"
  | "session_busy"
  | "conflict"
  | "not_configured"
  | "internal";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; retryAfterSeconds?: number };
}
