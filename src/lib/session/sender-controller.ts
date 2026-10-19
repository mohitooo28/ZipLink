import type { PendingRequestSummary } from "@/types/session";
import type { SignalMessage } from "@/types/signaling";
import type { ConnectionRoute, PhaseError, TransferProgressSnapshot } from "@/types/transfer";
import { ApiError, sessionApi, type SenderCredentials } from "@/lib/signaling/session-service";
import { openSignalingChannel, type SignalingChannel } from "@/lib/signaling/signaling-client";
import { negotiateChunkSize } from "@/lib/transfer/chunk-protocol";
import { ProgressTracker } from "@/lib/transfer/progress-tracker";
import { buildManifest, TransferAbortedError, TransferSender } from "@/lib/transfer/sender";
import {
  canSenderTransition,
  isSenderLive,
  isSenderTerminal,
  type SenderPhase,
} from "@/lib/transfer/transfer-state-machine";
import { ChannelIO } from "@/lib/webrtc/data-channel";
import { toRtcConfiguration } from "@/lib/webrtc/ice-configuration";
import { PeerLink, type PeerLinkState } from "@/lib/webrtc/peer-connection";
import { randomId, randomInt } from "@/lib/utils/random";
import { ObservableStore } from "./observable-store";

export interface SelectedFile {
  id: string;
  file: File;
}

export interface SenderSessionInfo {
  code: string;
  link: string;
  joinDeadline: number;
}

export interface SenderSnapshot {
  phase: SenderPhase;
  files: SelectedFile[];
  totalBytes: number;
  session: SenderSessionInfo | null;
  requests: PendingRequestSummary[];
  activeRequest: PendingRequestSummary | null;
  respondingTo: string | null;
  route: ConnectionRoute;
  progress: TransferProgressSnapshot | null;
  error: PhaseError | null;
}

/** All resources belonging to one sharing session. Replaced wholesale on restart. */
interface SenderRun {
  id: number;
  credentials: SenderCredentials | null;
  senderChannel: SignalingChannel | null;
  requestChannel: SignalingChannel | null;
  heartbeatTimer: ReturnType<typeof setTimeout> | null;
  heartbeatIntervalMs: number;
  heartbeatFailures: number;
  peer: PeerLink | null;
  io: ChannelIO | null;
  transfer: TransferSender | null;
  tracker: ProgressTracker | null;
  resumePhase: SenderPhase | null;
  sessionClosed: boolean;
}

const MAX_HEARTBEAT_FAILURES = 6;

const INITIAL: SenderSnapshot = {
  phase: "selecting",
  files: [],
  totalBytes: 0,
  session: null,
  requests: [],
  activeRequest: null,
  respondingTo: null,
  route: "unknown",
  progress: null,
  error: null,
};

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}

export class SenderController extends ObservableStore<SenderSnapshot> {
  private run: SenderRun | null = null;
  private runCounter = 0;
  private windowListenersAttached = false;

  constructor() {
    super(INITIAL);
  }

  getServerSnapshot = (): SenderSnapshot => INITIAL;

  // ------------------------------------------------------------- selection

  addFiles(list: FileList | readonly File[]): void {
    if (this.snapshot.phase !== "selecting") return;
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const files = [...this.snapshot.files, ...incoming.map((file) => ({ id: randomId(), file }))];
    this.update({ files, totalBytes: files.reduce((sum, entry) => sum + entry.file.size, 0) });
  }

  removeFile(id: string): void {
    if (this.snapshot.phase !== "selecting") return;
    const files = this.snapshot.files.filter((entry) => entry.id !== id);
    this.update({ files, totalBytes: files.reduce((sum, entry) => sum + entry.file.size, 0) });
  }

  clearFiles(): void {
    if (this.snapshot.phase !== "selecting") return;
    this.update({ files: [], totalBytes: 0 });
  }

  // --------------------------------------------------------------- session

  async startSharing(origin: string): Promise<void> {
    const { phase, files } = this.snapshot;
    if (files.length === 0) return;
    if (phase !== "selecting" && !isSenderTerminal(phase)) return;
    if (isSenderTerminal(phase)) this.setPhase("selecting");

    this.teardown();
    const run = this.newRun();
    this.update({ session: null, requests: [], activeRequest: null, progress: null, error: null, route: "unknown" }, false);
    this.setPhase("creating");

    try {
      const created = await sessionApi.createSession();
      if (!this.isCurrent(run)) return;
      run.credentials = { sessionId: created.sessionId, senderSecret: created.senderSecret };
      run.heartbeatIntervalMs = created.heartbeatIntervalMs;
      this.rtcConfig = toRtcConfiguration(created.iceServers);

      const url = new URL("/receive", origin);
      url.searchParams.set("code", created.code);
      url.searchParams.set("token", created.token);

      const channel = openSignalingChannel(created.senderChannel);
      run.senderChannel = channel;
      channel.onMessage((message) => this.handleSenderChannel(run, message));
      await channel.connect();
      if (!this.isCurrent(run)) return;

      this.attachWindowListeners();
      this.update({ session: { code: created.code, link: url.toString(), joinDeadline: created.joinDeadline } }, false);
      this.setPhase("waiting");
      this.scheduleHeartbeat(run, 0);
    } catch (error) {
      if (!this.isCurrent(run)) return;
      this.closeServerSession(run);
      this.teardown();
      this.fail("start_failed", describeError(error, "Couldn't start a sharing session."));
    }
  }

  /** Stop waiting for a receiver and go back to editing the file list. */
  stopSharing(): void {
    const { phase } = this.snapshot;
    if (phase !== "waiting" && phase !== "request-pending" && phase !== "creating") return;
    const run = this.run;
    if (run) this.closeServerSession(run);
    this.teardown();
    this.update({ session: null, requests: [], activeRequest: null, error: null }, false);
    this.setPhase("selecting");
  }

  async accept(requestId: string): Promise<void> {
    const run = this.run;
    const { phase, respondingTo } = this.snapshot;
    if (!run?.credentials || respondingTo || (phase !== "request-pending" && phase !== "waiting")) return;
    const request = this.snapshot.requests.find((entry) => entry.requestId === requestId) ?? null;
    if (!request) return;

    this.update({ respondingTo: requestId });
    try {
      const response = await sessionApi.respond(run.credentials, requestId, "accept");
      if (!this.isCurrent(run)) return;
      if (response.status !== "accepted" || !response.channel) throw new Error("The request is no longer available.");

      // No more join requests are accepted for this session.
      run.senderChannel?.close();
      run.senderChannel = null;

      this.update({ respondingTo: null, activeRequest: request, requests: [] }, false);
      this.setPhase("connecting");
      this.scheduleHeartbeat(run, run.heartbeatIntervalMs * 3);

      const channel = openSignalingChannel(response.channel);
      run.requestChannel = channel;
      channel.onMessage((message) => this.handleRequestChannel(run, message));
      await channel.connect();
      if (!this.isCurrent(run)) return;
      this.ensurePeer(run);
    } catch (error) {
      if (!this.isCurrent(run)) return;
      this.update({ respondingTo: null });
      if (this.snapshot.phase === "connecting") {
        this.failRun(run, "accept_failed", describeError(error, "Couldn't connect to the receiver."));
      } else {
        this.removeRequest(requestId);
        this.notifyError(describeError(error, "Couldn't accept the request."));
      }
    }
  }

  async reject(requestId: string): Promise<void> {
    const run = this.run;
    if (!run?.credentials || this.snapshot.respondingTo) return;
    this.update({ respondingTo: requestId });
    try {
      await sessionApi.respond(run.credentials, requestId, "reject");
    } catch {
      // Already gone — removing it locally is the right outcome either way.
    }
    if (!this.isCurrent(run)) return;
    this.update({ respondingTo: null }, false);
    this.removeRequest(requestId);
  }

  /** Cancel an active transfer (or a session that is waiting for a receiver). */
  cancel(reason = "The sender cancelled the transfer."): void {
    const run = this.run;
    const { phase } = this.snapshot;
    if (!run || isSenderTerminal(phase) || phase === "selecting") return;
    if (phase === "waiting" || phase === "request-pending" || phase === "creating") {
      this.stopSharing();
      return;
    }
    run.transfer?.abort(reason);
    void run.requestChannel
      ?.send({ v: 1, type: "cancel", from: "sender", reason })
      .catch(() => undefined);
    this.closeServerSession(run);
    this.markFilesFailed(run);
    this.teardown();
    this.update({ error: null }, false);
    this.setPhase("cancelled");
  }

  /** Back to file selection, keeping the chosen files. */
  reset(): void {
    if (!isSenderTerminal(this.snapshot.phase)) return;
    this.teardown();
    this.update({ session: null, requests: [], activeRequest: null, progress: null, error: null, route: "unknown" }, false);
    this.setPhase("selecting");
  }

  /** Back to an empty selection. */
  startOver(): void {
    this.reset();
    this.clearFiles();
  }

  dispose(): void {
    const run = this.run;
    if (run && isSenderLive(this.snapshot.phase)) {
      run.transfer?.abort("The sender left the page.");
    }
    if (run) this.closeServerSession(run, true);
    this.teardown();
    this.detachWindowListeners();
  }

  // ------------------------------------------------------------- internals

  private rtcConfig: RTCConfiguration = { iceServers: [] };

  private newRun(): SenderRun {
    this.runCounter += 1;
    this.run = {
      id: this.runCounter,
      credentials: null,
      senderChannel: null,
      requestChannel: null,
      heartbeatTimer: null,
      heartbeatIntervalMs: 5_000,
      heartbeatFailures: 0,
      peer: null,
      io: null,
      transfer: null,
      tracker: null,
      resumePhase: null,
      sessionClosed: false,
    };
    return this.run;
  }

  private isCurrent(run: SenderRun): boolean {
    return this.run === run;
  }

  private setPhase(phase: SenderPhase): boolean {
    const from = this.snapshot.phase;
    if (from === phase) return true;
    if (!canSenderTransition(from, phase)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[ziplink] ignored sender transition ${from} → ${phase}`);
      }
      return false;
    }
    this.update({ phase });
    return true;
  }

  private fail(code: string, message: string): void {
    this.update({ error: { code, message } }, false);
    if (!this.setPhase("failed")) this.emit();
  }

  private failRun(run: SenderRun, code: string, message: string): void {
    if (!this.isCurrent(run) || isSenderTerminal(this.snapshot.phase)) return;
    run.transfer?.abort(message);
    this.closeServerSession(run);
    this.markFilesFailed(run);
    this.teardown();
    this.fail(code, message);
  }

  private notifyError(message: string): void {
    this.update({ error: { code: "notice", message } });
  }

  private removeRequest(requestId: string): void {
    const requests = this.snapshot.requests.filter((entry) => entry.requestId !== requestId);
    this.update({ requests }, false);
    if (requests.length === 0 && this.snapshot.phase === "request-pending") this.setPhase("waiting");
    else this.emit();
  }

  private mergeRequests(requests: PendingRequestSummary[]): void {
    const { phase } = this.snapshot;
    if (phase !== "waiting" && phase !== "request-pending") return;
    this.update({ requests }, false);
    this.setPhase(requests.length > 0 ? "request-pending" : "waiting");
    this.emit();
  }

  private handleSenderChannel(run: SenderRun, message: SignalMessage): void {
    if (!this.isCurrent(run)) return;
    if (message.type === "join-request") {
      if (this.snapshot.requests.some((entry) => entry.requestId === message.request.requestId)) return;
      this.mergeRequests([...this.snapshot.requests, message.request]);
    } else if (message.type === "request-cancelled") {
      this.removeRequest(message.requestId);
    }
  }

  private handleRequestChannel(run: SenderRun, message: SignalMessage): void {
    if (!this.isCurrent(run)) return;
    switch (message.type) {
      case "ready":
        if (run.peer) run.peer.resendOffer();
        else this.ensurePeer(run);
        break;
      case "answer":
      case "ice":
        run.peer?.handleSignal(message);
        break;
      case "cancel":
        if (message.from === "receiver") this.peerCancelled(run, message.reason);
        break;
      default:
        break;
    }
  }

  private peerCancelled(run: SenderRun, reason: string): void {
    if (!this.isCurrent(run) || isSenderTerminal(this.snapshot.phase)) return;
    this.closeServerSession(run);
    this.markFilesFailed(run);
    this.teardown();
    this.update({ error: { code: "peer_cancelled", message: reason || "The receiver cancelled the transfer." } }, false);
    this.setPhase("cancelled");
  }

  private ensurePeer(run: SenderRun): void {
    if (run.peer || !run.requestChannel) return;
    const channel = run.requestChannel;
    const peer = new PeerLink({
      role: "sender",
      rtcConfig: this.rtcConfig,
      sendSignal: (message) => channel.send(message),
      onStateChange: (state, error) => this.handlePeerState(run, state, error?.message),
      onDataChannel: (dataChannel) => this.handleDataChannel(run, dataChannel),
      onRoute: (route) => {
        if (this.isCurrent(run)) this.update({ route });
      },
    });
    run.peer = peer;
    peer.start();
  }

  private handlePeerState(run: SenderRun, state: PeerLinkState, message?: string): void {
    if (!this.isCurrent(run)) return;
    const { phase } = this.snapshot;
    if (state === "reconnecting" && isSenderLive(phase) && phase !== "reconnecting") {
      run.resumePhase = phase;
      this.setPhase("reconnecting");
    } else if (state === "connected" && phase === "reconnecting" && run.resumePhase) {
      this.setPhase(run.resumePhase);
      run.resumePhase = null;
    } else if (state === "failed") {
      this.failRun(run, "connection_failed", message ?? "The connection to the receiver failed.");
    }
  }

  private handleDataChannel(run: SenderRun, dataChannel: RTCDataChannel): void {
    if (!this.isCurrent(run) || run.io) return;
    const files = this.snapshot.files.map((entry) => entry.file);
    const io = new ChannelIO(dataChannel);
    const tracker = new ProgressTracker(buildManifest(files));
    const transfer = new TransferSender(
      io,
      files,
      { transferId: randomInt(2 ** 32), chunkSize: negotiateChunkSize(run.peer?.maxMessageSize) },
      {
        onStart: () => {
          if (!this.isCurrent(run)) return;
          tracker.start();
          tracker.markActive(0);
          this.update({ progress: tracker.snapshot() }, false);
          this.setPhase("transferring");
        },
        onProgress: ({ confirmedBytes, fileIndex, fileConfirmedBytes }) => {
          if (!this.isCurrent(run)) return;
          tracker.update(confirmedBytes, fileIndex, fileConfirmedBytes);
          this.update({ progress: tracker.snapshot() }, false);
        },
        onFileComplete: (index) => {
          if (!this.isCurrent(run)) return;
          tracker.markDone(index);
          if (index + 1 < files.length) tracker.markActive(index + 1);
          this.update({ progress: tracker.snapshot() }, false);
        },
        onFinalizing: () => {
          if (this.isCurrent(run) && this.snapshot.phase === "transferring") this.setPhase("finalizing");
        },
      },
    );
    run.io = io;
    run.transfer = transfer;
    run.tracker = tracker;

    io.onControl((message) => transfer.handleControl(message));
    io.onInvalid((reason) => this.failRun(run, "protocol_error", reason));
    io.onClose(() => {
      if (!this.isCurrent(run) || isSenderTerminal(this.snapshot.phase)) return;
      this.failRun(run, "peer_disconnected", "The receiver disconnected before the transfer finished.");
    });

    transfer.finished.then(
      () => this.complete(run),
      (error: unknown) => {
        if (!this.isCurrent(run) || isSenderTerminal(this.snapshot.phase)) return;
        if (error instanceof TransferAbortedError && error.byPeer) this.peerCancelled(run, error.message);
        else this.failRun(run, "transfer_failed", describeError(error, "The transfer failed."));
      },
    );

    try {
      transfer.sendManifest();
    } catch (error) {
      this.failRun(run, "transfer_failed", describeError(error, "Couldn't start the transfer."));
      return;
    }
    this.update({ progress: tracker.snapshot() }, false);
    this.setPhase("reviewing");
  }

  private complete(run: SenderRun): void {
    if (!this.isCurrent(run) || isSenderTerminal(this.snapshot.phase)) return;
    run.tracker?.finish();
    const progress = run.tracker?.snapshot() ?? null;
    this.closeServerSession(run);
    this.teardown();
    this.update({ progress }, false);
    if (this.snapshot.phase !== "finalizing") this.setPhase("finalizing");
    this.setPhase("completed");
  }

  private markFilesFailed(run: SenderRun): void {
    if (!run.tracker) return;
    run.tracker.markActiveFailed();
    run.tracker.finish();
    this.update({ progress: run.tracker.snapshot() }, false);
  }

  private scheduleHeartbeat(run: SenderRun, delay: number): void {
    if (run.heartbeatTimer) clearTimeout(run.heartbeatTimer);
    run.heartbeatTimer = setTimeout(() => void this.heartbeat(run), delay);
  }

  private async heartbeat(run: SenderRun): Promise<void> {
    if (!this.isCurrent(run) || !run.credentials || run.sessionClosed) return;
    const waiting = this.snapshot.phase === "waiting" || this.snapshot.phase === "request-pending";
    try {
      const response = await sessionApi.heartbeat(run.credentials);
      if (!this.isCurrent(run)) return;
      run.heartbeatFailures = 0;
      if (response.status === "expired" || response.status === "closed") {
        run.sessionClosed = true;
        // A running peer-to-peer transfer does not depend on the server session.
        if (waiting) this.expire(run);
        return;
      }
      if (waiting) this.mergeRequests(response.requests);
    } catch (error) {
      if (!this.isCurrent(run)) return;
      run.heartbeatFailures += 1;
      const gone = error instanceof ApiError && (error.status === 404 || error.status === 410);
      if (waiting && (gone || run.heartbeatFailures >= MAX_HEARTBEAT_FAILURES)) {
        run.sessionClosed = true;
        this.expire(run);
        return;
      }
    }
    const nextDelay = waiting ? run.heartbeatIntervalMs : run.heartbeatIntervalMs * 3;
    this.scheduleHeartbeat(run, nextDelay);
  }

  private expire(run: SenderRun): void {
    if (!this.isCurrent(run)) return;
    this.teardown();
    this.update({ requests: [], error: { code: "expired", message: "This sharing code has expired." } }, false);
    this.setPhase("expired");
  }

  private closeServerSession(run: SenderRun, unloading = false): void {
    if (!run.credentials || run.sessionClosed) return;
    run.sessionClosed = true;
    if (unloading) sessionApi.closeSessionBeacon(run.credentials);
    else void sessionApi.closeSession(run.credentials).catch(() => undefined);
  }

  /** Release every resource of the current run; late callbacks become no-ops. */
  private teardown(): void {
    const run = this.run;
    this.run = null;
    if (!run) return;
    if (run.heartbeatTimer) clearTimeout(run.heartbeatTimer);
    run.io?.dispose();
    run.peer?.close();
    run.senderChannel?.close();
    run.requestChannel?.close();
    this.detachWindowListeners();
  }

  // --------------------------------------------------------- page lifecycle

  private readonly onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return; // bfcache: the page may come back
    const run = this.run;
    if (!run) return;
    if (isSenderLive(this.snapshot.phase)) {
      run.transfer?.abort("The sender closed the page.");
      void run.requestChannel?.send({ v: 1, type: "cancel", from: "sender", reason: "The sender closed the page." }).catch(() => undefined);
    }
    this.closeServerSession(run, true);
  };

  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (isSenderLive(this.snapshot.phase)) event.preventDefault();
  };

  private attachWindowListeners(): void {
    if (this.windowListenersAttached || typeof window === "undefined") return;
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.windowListenersAttached = true;
  }

  private detachWindowListeners(): void {
    if (!this.windowListenersAttached) return;
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.windowListenersAttached = false;
  }
}
