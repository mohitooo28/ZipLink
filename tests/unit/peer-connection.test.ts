import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalMessage } from "@/types/signaling";
import { PeerLink, type PeerLinkState } from "@/lib/webrtc/peer-connection";

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = "connecting";
  binaryType: BinaryType = "blob";
  constructor(readonly label: string) {
    super();
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }
  close() {
    this.readyState = "closed";
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  sctp = { maxMessageSize: 262_144 };
  onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;
  channel: FakeDataChannel | null = null;
  offerOptions: Array<RTCOfferOptions | undefined> = [];
  addedCandidates: RTCIceCandidateInit[] = [];
  answers = 0;
  closed = false;

  createDataChannel(label: string) {
    this.channel = new FakeDataChannel(label);
    return this.channel;
  }
  async createOffer(options?: RTCOfferOptions) {
    this.offerOptions.push(options);
    return { type: "offer" as const, sdp: `offer-${this.offerOptions.length}` };
  }
  async createAnswer() {
    this.answers += 1;
    return { type: "answer" as const, sdp: `answer-${this.answers}` };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.addedCandidates.push(candidate);
  }
  async getStats() {
    return new Map();
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
  setState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function createLink(role: "sender" | "receiver") {
  const sent: SignalMessage[] = [];
  const states: PeerLinkState[] = [];
  const errors: string[] = [];
  let pc: FakePeerConnection | null = null;
  const link = new PeerLink({
    role,
    rtcConfig: {},
    sendSignal: async (message) => {
      sent.push(message);
    },
    onStateChange: (state, error) => {
      states.push(state);
      if (error) errors.push(error.code);
    },
    createPeerConnection: () => {
      pc = new FakePeerConnection();
      return pc as unknown as RTCPeerConnection;
    },
    connectTimeoutMs: 10_000,
    disconnectGraceMs: 2_000,
    reconnectTimeoutMs: 15_000,
    maxIceRestarts: 1,
  });
  return { link, sent, states, errors, pc: () => pc! };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PeerLink negotiation", () => {
  it("sender creates a data channel, offers, and applies the answer and queued candidates", async () => {
    const { link, sent, pc } = createLink("sender");
    link.start();
    await flush();
    expect(pc().channel?.label).toBe("ziplink-transfer");
    expect(sent[0]).toMatchObject({ type: "offer", attempt: 0, sdp: "offer-1" });

    link.handleSignal({ v: 1, type: "ice", from: "receiver", candidates: [{ candidate: "c1" }] });
    await flush();
    expect(pc().addedCandidates).toHaveLength(0); // queued until the answer arrives

    link.handleSignal({ v: 1, type: "answer", from: "receiver", sdp: "answer-x", attempt: 0 });
    await flush();
    expect(pc().remoteDescription?.sdp).toBe("answer-x");
    expect(pc().addedCandidates).toEqual([{ candidate: "c1" }]);
  });

  it("batches outgoing ICE candidates", async () => {
    const { link, sent, pc } = createLink("sender");
    link.start();
    await flush();
    for (const candidate of ["a", "b", "c"]) pc().onicecandidate?.({ candidate: { toJSON: () => ({ candidate }) } });
    await vi.advanceTimersByTimeAsync(100);
    const ice = sent.filter((m) => m.type === "ice");
    expect(ice).toHaveLength(1);
    expect(ice[0]).toMatchObject({ candidates: [{ candidate: "a" }, { candidate: "b" }, { candidate: "c" }] });
  });

  it("receiver answers once and re-sends the same answer for a duplicate offer", async () => {
    const { link, sent, pc } = createLink("receiver");
    link.start();
    link.handleSignal({ v: 1, type: "offer", from: "sender", sdp: "o", attempt: 0 });
    await flush();
    link.handleSignal({ v: 1, type: "offer", from: "sender", sdp: "o", attempt: 0 });
    await flush();
    const answers = sent.filter((m) => m.type === "answer");
    expect(answers).toHaveLength(2);
    expect(answers[0]).toEqual(answers[1]);
    expect(pc().answers).toBe(1);
  });

  it("resendOffer repeats the pending offer for a receiver that re-announces itself", async () => {
    const { link, sent } = createLink("sender");
    link.start();
    await flush();
    link.resendOffer();
    await flush();
    expect(sent.filter((m) => m.type === "offer")).toHaveLength(2);
  });
});

describe("PeerLink lifecycle", () => {
  it("fails with a timeout if the data channel never opens, and cleans up", async () => {
    const { link, states, errors, pc } = createLink("sender");
    link.start();
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(states.at(-1)).toBe("failed");
    expect(errors).toEqual(["connect_timeout"]);
    expect(pc().closed).toBe(true);
    expect(pc().onconnectionstatechange).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ICE failure before the link is up fails fast with a TURN hint", async () => {
    const { link, errors } = createLink("sender");
    link.start();
    await flush();
    const peer = (link as unknown as { pc: FakePeerConnection }).pc;
    peer.setState("failed");
    expect(errors).toEqual(["ice_failed"]);
  });

  it("tolerates a transient disconnect without tearing down", async () => {
    const { link, states, pc } = createLink("sender");
    link.start();
    await flush();
    pc().channel!.open();
    expect(link.currentState).toBe("connected");

    pc().setState("disconnected");
    expect(link.currentState).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    pc().setState("connected");
    expect(link.currentState).toBe("connected");
    expect(pc().closed).toBe(false);
    expect(states).toEqual(["connecting", "connected", "reconnecting", "connected"]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(link.currentState).toBe("connected");
  });

  it("restarts ICE after the grace period and ignores stale answers", async () => {
    const { link, sent, pc } = createLink("sender");
    link.start();
    await flush();
    link.handleSignal({ v: 1, type: "answer", from: "receiver", sdp: "a0", attempt: 0 });
    await flush();
    pc().channel!.open();

    pc().setState("disconnected");
    await vi.advanceTimersByTimeAsync(2_000);
    const restart = sent.filter((m) => m.type === "offer").at(-1);
    expect(restart).toMatchObject({ attempt: 1 });
    expect(pc().offerOptions.at(-1)).toEqual({ iceRestart: true });

    link.handleSignal({ v: 1, type: "answer", from: "receiver", sdp: "stale", attempt: 0 });
    await flush();
    expect(pc().remoteDescription?.sdp).toBe("a0");
    link.handleSignal({ v: 1, type: "answer", from: "receiver", sdp: "a1", attempt: 1 });
    await flush();
    expect(pc().remoteDescription?.sdp).toBe("a1");
    pc().setState("connected");
    expect(link.currentState).toBe("connected");
  });

  it("gives up after the reconnect deadline and clears every timer", async () => {
    const { link, errors, pc } = createLink("sender");
    link.start();
    await flush();
    pc().channel!.open();
    pc().setState("failed"); // uses the single allowed restart
    await flush();
    pc().setState("failed"); // still failing, no restarts left
    expect(errors).toEqual(["connection_lost"]);
    expect(link.currentState).toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("close() is final: later signals and events are ignored", async () => {
    const { link, sent, states, pc } = createLink("sender");
    link.start();
    await flush();
    const peer = pc();
    link.close();
    expect(states.at(-1)).toBe("closed");
    const before = sent.length;
    link.handleSignal({ v: 1, type: "answer", from: "receiver", sdp: "a", attempt: 0 });
    link.resendOffer();
    await flush();
    expect(sent.length).toBe(before);
    expect(peer.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
