import type { PendingRequestSummary } from "./session";

/**
 * Messages carried by the signaling service. These never contain file data or
 * file metadata — only what is needed to coordinate a session and negotiate
 * the WebRTC connection.
 */

export type SignalSource = "server" | "sender" | "receiver";

interface Base<T extends string, F extends SignalSource> {
  v: 1;
  type: T;
  from: F;
}

/** Server → sender channel: a receiver asked to join. */
export interface JoinRequestSignal extends Base<"join-request", "server"> {
  request: PendingRequestSummary;
}

/** Server → sender channel: a pending receiver withdrew. */
export interface RequestCancelledSignal
  extends Base<"request-cancelled", "server"> {
  requestId: string;
}

/** Server → request channel: decision on the receiver's request. */
export interface DecisionSignal extends Base<"accept" | "reject", "server"> {
  requestId: string;
  reason?: string;
}

/** Server → request channel: the session ended before the request was handled. */
export interface SessionClosedSignal extends Base<"session-closed", "server"> {
  reason: string;
}

/** Receiver → sender: subscribed and ready for an offer. */
export type ReadySignal = Base<"ready", "receiver">;

export interface OfferSignal extends Base<"offer", "sender"> {
  sdp: string;
  /** Incremented on every ICE restart so stale answers can be ignored. */
  attempt: number;
}

export interface AnswerSignal extends Base<"answer", "receiver"> {
  sdp: string;
  attempt: number;
}

export interface IceSignal extends Base<"ice", "sender" | "receiver"> {
  candidates: RTCIceCandidateInit[];
}

export interface CancelSignal extends Base<"cancel", "sender" | "receiver"> {
  reason: string;
}

export type SignalMessage =
  | JoinRequestSignal
  | RequestCancelledSignal
  | DecisionSignal
  | SessionClosedSignal
  | ReadySignal
  | OfferSignal
  | AnswerSignal
  | IceSignal
  | CancelSignal;

export type SignalType = SignalMessage["type"];

export type ChannelStatus = "connecting" | "connected" | "reconnecting" | "closed";
