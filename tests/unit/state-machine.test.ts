import { describe, expect, it } from "vitest";
import {
  canReceiverTransition,
  canSenderTransition,
  isReceiverTerminal,
  isSenderTerminal,
  RECEIVER_TRANSITIONS,
  SENDER_TRANSITIONS,
  type ReceiverPhase,
  type SenderPhase,
} from "@/lib/transfer/transfer-state-machine";

function walk<T extends string>(path: T[], can: (a: T, b: T) => boolean) {
  for (let i = 1; i < path.length; i += 1) expect(can(path[i - 1], path[i]), `${path[i - 1]} → ${path[i]}`).toBe(true);
}

describe("sender state machine", () => {
  it("allows the happy path", () => {
    walk<SenderPhase>(
      ["selecting", "creating", "waiting", "request-pending", "connecting", "reviewing", "transferring", "finalizing", "completed", "selecting"],
      canSenderTransition,
    );
  });

  it("supports reconnection back to the interrupted phase", () => {
    walk<SenderPhase>(["transferring", "reconnecting", "transferring"], canSenderTransition);
    walk<SenderPhase>(["reviewing", "reconnecting", "failed"], canSenderTransition);
  });

  it("supports cancellation, rejection back to waiting and expiry", () => {
    walk<SenderPhase>(["request-pending", "waiting", "expired", "creating"], canSenderTransition);
    expect(canSenderTransition("transferring", "cancelled")).toBe(true);
    expect(canSenderTransition("waiting", "selecting")).toBe(true);
  });

  it("forbids skipping steps or completing without finalizing", () => {
    expect(canSenderTransition("selecting", "transferring")).toBe(false);
    expect(canSenderTransition("transferring", "completed")).toBe(false);
    expect(canSenderTransition("waiting", "transferring")).toBe(false);
    expect(canSenderTransition("completed", "transferring")).toBe(false);
    expect(canSenderTransition("cancelled", "transferring")).toBe(false);
  });

  it("terminal phases only lead back to a fresh start", () => {
    for (const phase of Object.keys(SENDER_TRANSITIONS) as SenderPhase[]) {
      if (!isSenderTerminal(phase)) continue;
      for (const next of SENDER_TRANSITIONS[phase]) expect(["selecting", "creating"]).toContain(next);
    }
  });
});

describe("receiver state machine", () => {
  it("allows the happy path", () => {
    walk<ReceiverPhase>(
      ["entering", "joining", "awaiting-approval", "connecting", "reviewing", "transferring", "finalizing", "completed", "entering"],
      canReceiverTransition,
    );
  });

  it("handles rejection, expiry and cancellation", () => {
    walk<ReceiverPhase>(["awaiting-approval", "rejected", "entering"], canReceiverTransition);
    walk<ReceiverPhase>(["awaiting-approval", "expired", "entering"], canReceiverTransition);
    walk<ReceiverPhase>(["transferring", "cancelled", "entering"], canReceiverTransition);
    walk<ReceiverPhase>(["finalizing", "reconnecting", "finalizing"], canReceiverTransition);
  });

  it("forbids receiving before approval", () => {
    expect(canReceiverTransition("awaiting-approval", "transferring")).toBe(false);
    expect(canReceiverTransition("entering", "connecting")).toBe(false);
    expect(canReceiverTransition("rejected", "connecting")).toBe(false);
  });

  it("every terminal phase returns to code entry only", () => {
    for (const phase of Object.keys(RECEIVER_TRANSITIONS) as ReceiverPhase[]) {
      if (isReceiverTerminal(phase)) expect(RECEIVER_TRANSITIONS[phase]).toEqual(["entering"]);
    }
  });
});
