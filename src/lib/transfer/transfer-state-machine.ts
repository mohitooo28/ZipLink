/**
 * Explicit workflow states for both sides of a transfer. Controllers may only
 * move along the edges below; anything else is a bug and is ignored.
 */

export type SenderPhase =
  | "selecting"
  | "creating"
  | "waiting"
  | "request-pending"
  | "connecting"
  | "reviewing"
  | "transferring"
  | "finalizing"
  | "reconnecting"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type ReceiverPhase =
  | "entering"
  | "joining"
  | "awaiting-approval"
  | "connecting"
  | "reviewing"
  | "transferring"
  | "finalizing"
  | "reconnecting"
  | "completed"
  | "rejected"
  | "failed"
  | "cancelled"
  | "expired";

const SENDER_TERMINAL = ["completed", "failed", "cancelled", "expired"] as const;
const RECEIVER_TERMINAL = ["completed", "rejected", "failed", "cancelled", "expired"] as const;

/** Phases during which a live peer connection exists and may drop. */
const SENDER_LIVE: SenderPhase[] = ["connecting", "reviewing", "transferring", "finalizing", "reconnecting"];
const RECEIVER_LIVE: ReceiverPhase[] = ["connecting", "reviewing", "transferring", "finalizing", "reconnecting"];

const ABORTABLE_SENDER: SenderPhase[] = ["failed", "cancelled"];
const ABORTABLE_RECEIVER: ReceiverPhase[] = ["failed", "cancelled"];

export const SENDER_TRANSITIONS: Record<SenderPhase, readonly SenderPhase[]> = {
  selecting: ["creating"],
  creating: ["waiting", "failed", "selecting"],
  waiting: ["request-pending", "connecting", "expired", "selecting", ...ABORTABLE_SENDER],
  "request-pending": ["waiting", "connecting", "expired", "selecting", ...ABORTABLE_SENDER],
  connecting: ["reviewing", "reconnecting", "expired", ...ABORTABLE_SENDER],
  reviewing: ["transferring", "reconnecting", ...ABORTABLE_SENDER],
  transferring: ["finalizing", "reconnecting", ...ABORTABLE_SENDER],
  finalizing: ["completed", "reconnecting", ...ABORTABLE_SENDER],
  reconnecting: ["connecting", "reviewing", "transferring", "finalizing", ...ABORTABLE_SENDER],
  completed: ["selecting"],
  failed: ["selecting", "creating"],
  cancelled: ["selecting", "creating"],
  expired: ["selecting", "creating"],
};

export const RECEIVER_TRANSITIONS: Record<ReceiverPhase, readonly ReceiverPhase[]> = {
  entering: ["joining"],
  joining: ["awaiting-approval", "connecting", "rejected", "entering", "failed", "expired"],
  "awaiting-approval": ["connecting", "rejected", "expired", "entering", ...ABORTABLE_RECEIVER],
  connecting: ["reviewing", "reconnecting", ...ABORTABLE_RECEIVER],
  reviewing: ["transferring", "reconnecting", ...ABORTABLE_RECEIVER],
  transferring: ["finalizing", "reconnecting", "completed", ...ABORTABLE_RECEIVER],
  finalizing: ["completed", "reconnecting", ...ABORTABLE_RECEIVER],
  reconnecting: ["connecting", "reviewing", "transferring", "finalizing", ...ABORTABLE_RECEIVER],
  completed: ["entering"],
  rejected: ["entering"],
  failed: ["entering"],
  cancelled: ["entering"],
  expired: ["entering"],
};

export function canSenderTransition(from: SenderPhase, to: SenderPhase): boolean {
  return SENDER_TRANSITIONS[from].includes(to);
}

export function canReceiverTransition(from: ReceiverPhase, to: ReceiverPhase): boolean {
  return RECEIVER_TRANSITIONS[from].includes(to);
}

export function isSenderTerminal(phase: SenderPhase): boolean {
  return (SENDER_TERMINAL as readonly string[]).includes(phase);
}

export function isReceiverTerminal(phase: ReceiverPhase): boolean {
  return (RECEIVER_TERMINAL as readonly string[]).includes(phase);
}

export function isSenderLive(phase: SenderPhase): boolean {
  return SENDER_LIVE.includes(phase);
}

export function isReceiverLive(phase: ReceiverPhase): boolean {
  return RECEIVER_LIVE.includes(phase);
}
