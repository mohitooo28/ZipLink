import type { Role } from "@/types/session";
import type { AnswerSignal, IceSignal, OfferSignal, SignalMessage } from "@/types/signaling";
import type { ConnectionRoute } from "@/types/transfer";
import { routeFromStats } from "./ice-configuration";

/**
 * Owns one RTCPeerConnection and its negotiation.
 *
 * - The sender is always the offerer and creates the data channel.
 * - Signals are processed one at a time, so offers, answers and candidates
 *   can never interleave.
 * - A brief `disconnected` state is tolerated; if it persists (or ICE fails
 *   after the link was up) the sender performs an ICE restart. Only when the
 *   connection cannot be recovered in time is the link reported as failed.
 */

export type PeerLinkState = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";

export type PeerFailureCode = "connect_timeout" | "ice_failed" | "connection_lost" | "negotiation_failed";

export class PeerLinkError extends Error {
  constructor(
    readonly code: PeerFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "PeerLinkError";
  }
}

export interface PeerLinkOptions {
  role: Role;
  rtcConfig: RTCConfiguration;
  sendSignal: (message: SignalMessage) => Promise<void>;
  onStateChange?: (state: PeerLinkState, error?: PeerLinkError) => void;
  onDataChannel?: (channel: RTCDataChannel) => void;
  onRoute?: (route: ConnectionRoute) => void;
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
  connectTimeoutMs?: number;
  disconnectGraceMs?: number;
  reconnectTimeoutMs?: number;
  maxIceRestarts?: number;
}

export const DATA_CHANNEL_LABEL = "ziplink-transfer";
const CANDIDATE_BATCH_MS = 60;

export class PeerLink {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private state: PeerLinkState = "idle";
  private established = false;

  private localAttempt = 0;
  private remoteAttempt = -1;
  private lastOffer: OfferSignal | null = null;
  private lastAnswer: AnswerSignal | null = null;
  private iceRestarts = 0;

  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private outgoingCandidates: RTCIceCandidateInit[] = [];
  private candidateTimer: ReturnType<typeof setTimeout> | null = null;

  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private signalQueue: Promise<void> = Promise.resolve();

  private readonly connectTimeoutMs: number;
  private readonly disconnectGraceMs: number;
  private readonly reconnectTimeoutMs: number;
  private readonly maxIceRestarts: number;

  constructor(private readonly options: PeerLinkOptions) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? 30_000;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 5_000;
    this.reconnectTimeoutMs = options.reconnectTimeoutMs ?? 30_000;
    this.maxIceRestarts = options.maxIceRestarts ?? 2;
  }

  get currentState(): PeerLinkState {
    return this.state;
  }

  get dataChannel(): RTCDataChannel | null {
    return this.channel;
  }

  /** Negotiated SCTP max message size (null if unknown). */
  get maxMessageSize(): number | null {
    const size = this.pc?.sctp?.maxMessageSize;
    return typeof size === "number" && size > 0 ? size : null;
  }

  /** Begin connecting. The sender sends an offer; the receiver waits for one. */
  start(): void {
    if (this.state !== "idle") return;
    this.setState("connecting");
    this.connectTimer = setTimeout(() => {
      this.fail(
        new PeerLinkError(
          "connect_timeout",
          "Couldn't establish a connection between the devices. A firewall or restrictive network may be blocking peer-to-peer traffic.",
        ),
      );
    }, this.connectTimeoutMs);

    this.ensurePeerConnection();
    if (this.options.role === "sender") {
      const pc = this.pc;
      if (!pc) return;
      const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      this.attachChannel(channel);
      this.enqueue(() => this.sendOffer(false));
    }
  }

  /** Re-send the current offer if it may have been lost (receiver re-announced itself). */
  resendOffer(): void {
    if (this.options.role !== "sender" || !this.lastOffer || this.isTerminal()) return;
    if (this.pc?.signalingState === "have-local-offer") {
      void this.options.sendSignal(this.lastOffer).catch(() => undefined);
    }
  }

  handleSignal(message: SignalMessage): void {
    if (this.isTerminal()) return;
    if (message.type === "offer" && this.options.role === "receiver") {
      this.enqueue(() => this.handleOffer(message));
    } else if (message.type === "answer" && this.options.role === "sender") {
      this.enqueue(() => this.handleAnswer(message));
    } else if (message.type === "ice" && message.from !== this.options.role) {
      this.enqueue(() => this.handleRemoteCandidates(message));
    }
  }

  close(): void {
    if (this.state === "closed") return;
    this.clearTimers();
    this.teardown();
    this.setState("closed");
  }

  // ------------------------------------------------------------ internals

  private isTerminal(): boolean {
    return this.state === "failed" || this.state === "closed";
  }

  private enqueue(task: () => Promise<void>): void {
    this.signalQueue = this.signalQueue
      .then(async () => {
        if (!this.isTerminal()) await task();
      })
      .catch((error: unknown) => {
        this.fail(
          new PeerLinkError(
            "negotiation_failed",
            error instanceof Error ? `Connection setup failed: ${error.message}` : "Connection setup failed.",
          ),
        );
      });
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const create = this.options.createPeerConnection ?? ((config) => new RTCPeerConnection(config));
    const pc = create(this.options.rtcConfig);
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) this.queueOutgoingCandidate(event.candidate.toJSON());
      else this.flushOutgoingCandidates();
    };
    pc.onconnectionstatechange = () => this.handleConnectionState();
    pc.oniceconnectionstatechange = () => {
      // Engines without connectionState rely on the ICE state alone.
      if (pc.connectionState === undefined) this.handleConnectionState();
    };
    pc.ondatachannel = (event) => {
      if (this.options.role === "receiver" && event.channel.label === DATA_CHANNEL_LABEL && !this.channel) {
        this.attachChannel(event.channel);
      }
    };
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    const onOpen = () => {
      if (this.isTerminal()) return;
      this.established = true;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.setState("connected");
      this.options.onDataChannel?.(channel);
      void this.detectRoute();
    };
    if (channel.readyState === "open") onOpen();
    else channel.addEventListener("open", onOpen, { once: true });
  }

  private async sendOffer(iceRestart: boolean): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (iceRestart) this.localAttempt += 1;
    const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription?.sdp ?? offer.sdp ?? "";
    this.lastOffer = { v: 1, type: "offer", from: "sender", sdp, attempt: this.localAttempt };
    await this.options.sendSignal(this.lastOffer);
  }

  private async handleOffer(message: OfferSignal): Promise<void> {
    if (message.attempt < this.remoteAttempt) return;
    if (message.attempt === this.remoteAttempt) {
      // Duplicate offer: our answer may have been lost — send it again.
      if (this.lastAnswer) await this.options.sendSignal(this.lastAnswer);
      return;
    }
    const pc = this.ensurePeerConnection();
    this.remoteAttempt = message.attempt;
    await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
    await this.flushRemoteCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.lastAnswer = {
      v: 1,
      type: "answer",
      from: "receiver",
      sdp: pc.localDescription?.sdp ?? answer.sdp ?? "",
      attempt: message.attempt,
    };
    await this.options.sendSignal(this.lastAnswer);
  }

  private async handleAnswer(message: AnswerSignal): Promise<void> {
    const pc = this.pc;
    if (!pc || message.attempt !== this.localAttempt || pc.signalingState !== "have-local-offer") return;
    await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
    await this.flushRemoteCandidates();
  }

  private async handleRemoteCandidates(message: IceSignal): Promise<void> {
    const pc = this.pc;
    if (!pc || !pc.remoteDescription) {
      this.pendingRemoteCandidates.push(...message.candidates);
      return;
    }
    for (const candidate of message.candidates) await this.addCandidate(pc, candidate);
  }

  private async flushRemoteCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const candidates = this.pendingRemoteCandidates.splice(0);
    for (const candidate of candidates) await this.addCandidate(pc, candidate);
  }

  private async addCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Candidates from a previous ICE generation are expected to be rejected.
    }
  }

  private queueOutgoingCandidate(candidate: RTCIceCandidateInit): void {
    this.outgoingCandidates.push(candidate);
    if (this.outgoingCandidates.length >= 32) {
      this.flushOutgoingCandidates();
    } else if (!this.candidateTimer) {
      this.candidateTimer = setTimeout(() => this.flushOutgoingCandidates(), CANDIDATE_BATCH_MS);
    }
  }

  private flushOutgoingCandidates(): void {
    if (this.candidateTimer) clearTimeout(this.candidateTimer);
    this.candidateTimer = null;
    const candidates = this.outgoingCandidates.splice(0);
    if (candidates.length === 0 || this.isTerminal()) return;
    const from = this.options.role;
    void this.options.sendSignal({ v: 1, type: "ice", from, candidates }).catch(() => undefined);
  }

  private handleConnectionState(): void {
    const pc = this.pc;
    if (!pc || this.isTerminal()) return;
    const state = pc.connectionState ?? mapIceState(pc.iceConnectionState);

    switch (state) {
      case "connected":
        if (this.graceTimer) clearTimeout(this.graceTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.graceTimer = this.reconnectTimer = null;
        if (this.established && this.state === "reconnecting") {
          this.setState("connected");
          void this.detectRoute();
        }
        break;
      case "disconnected":
        if (!this.established) return; // the connect timeout covers initial setup
        this.beginReconnect();
        if (!this.graceTimer) {
          this.graceTimer = setTimeout(() => {
            this.graceTimer = null;
            if (this.pc?.connectionState !== "connected") this.tryIceRestart();
          }, this.disconnectGraceMs);
        }
        break;
      case "failed":
        if (!this.established) {
          this.fail(
            new PeerLinkError(
              "ice_failed",
              "The devices couldn't reach each other. The network may block peer-to-peer connections; a TURN relay is needed in that case.",
            ),
          );
          return;
        }
        this.beginReconnect();
        this.tryIceRestart();
        break;
      case "closed":
        this.fail(new PeerLinkError("connection_lost", "The connection to the other device was closed."));
        break;
      default:
        break;
    }
  }

  private beginReconnect(): void {
    if (this.state !== "reconnecting") this.setState("reconnecting");
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.fail(new PeerLinkError("connection_lost", "Lost the connection to the other device and couldn't reconnect."));
      }, this.reconnectTimeoutMs);
    }
  }

  /** Only the offerer restarts ICE; the receiver answers the new offer. */
  private tryIceRestart(): void {
    if (this.options.role !== "sender" || this.isTerminal()) return;
    if (this.iceRestarts >= this.maxIceRestarts) {
      if (this.pc?.connectionState === "failed") {
        this.fail(new PeerLinkError("connection_lost", "Lost the connection to the other device and couldn't reconnect."));
      }
      return;
    }
    this.iceRestarts += 1;
    this.enqueue(() => this.sendOffer(true));
  }

  private async detectRoute(): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.options.onRoute) return;
    try {
      const stats = await pc.getStats();
      this.options.onRoute(routeFromStats(stats as unknown as Parameters<typeof routeFromStats>[0]));
    } catch {
      this.options.onRoute("unknown");
    }
  }

  private fail(error: PeerLinkError): void {
    if (this.isTerminal()) return;
    this.clearTimers();
    this.teardown();
    this.setState("failed", error);
  }

  private teardown(): void {
    const { pc, channel } = this;
    this.pc = null;
    this.channel = null;
    this.pendingRemoteCandidates = [];
    this.outgoingCandidates = [];
    if (pc) {
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
    }
    try {
      channel?.close();
    } catch {
      // ignore
    }
    try {
      pc?.close();
    } catch {
      // ignore
    }
  }

  private clearTimers(): void {
    for (const timer of [this.connectTimer, this.graceTimer, this.reconnectTimer, this.candidateTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.connectTimer = this.graceTimer = this.reconnectTimer = this.candidateTimer = null;
  }

  private setState(state: PeerLinkState, error?: PeerLinkError): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state, error);
  }
}

function mapIceState(state: RTCIceConnectionState): RTCPeerConnectionState {
  switch (state) {
    case "checking":
      return "connecting";
    case "completed":
      return "connected";
    default:
      return state as RTCPeerConnectionState;
  }
}
