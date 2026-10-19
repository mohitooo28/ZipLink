import type { SignalMessage } from "@/types/signaling";
import type { ConnectionRoute, PhaseError, SavedFile, SaveTargetKind, TransferProgressSnapshot } from "@/types/transfer";
import { ApiError, sessionApi, type ReceiverCredentials } from "@/lib/signaling/session-service";
import { openSignalingChannel, type SignalingChannel } from "@/lib/signaling/signaling-client";
import {
  BrowserStorageSaveTarget,
  detectSaveCapabilities,
  DirectorySaveTarget,
  estimateFreeBrowserStorage,
  MEMORY_TARGET_WARN_BYTES,
  MemorySaveTarget,
  type SaveCapabilities,
  type SaveTarget,
} from "@/lib/transfer/file-writer";
import { ProgressTracker } from "@/lib/transfer/progress-tracker";
import { TransferReceiver, type ManifestInfo } from "@/lib/transfer/receiver";
import { TransferAbortedError } from "@/lib/transfer/sender";
import {
  canReceiverTransition,
  isReceiverLive,
  isReceiverTerminal,
  type ReceiverPhase,
} from "@/lib/transfer/transfer-state-machine";
import { isValidSessionCode } from "@/lib/utils/generate-session-code";
import { formatBytes } from "@/lib/utils/format-bytes";
import { ChannelIO } from "@/lib/webrtc/data-channel";
import { toRtcConfiguration } from "@/lib/webrtc/ice-configuration";
import { PeerLink, type PeerLinkState } from "@/lib/webrtc/peer-connection";
import { ObservableStore } from "./observable-store";

export interface ReceiverSnapshot {
  phase: ReceiverPhase;
  code: string | null;
  manifest: ManifestInfo | null;
  capabilities: SaveCapabilities;
  target: { kind: SaveTargetKind; label: string } | null;
  choosingTarget: boolean;
  storageNotice: string | null;
  savedFiles: SavedFile[];
  route: ConnectionRoute;
  progress: TransferProgressSnapshot | null;
  error: PhaseError | null;
}

interface ReceiverRun {
  credentials: ReceiverCredentials | null;
  channel: SignalingChannel | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  readyTimer: ReturnType<typeof setInterval> | null;
  accepted: boolean;
  offerSeen: boolean;
  peer: PeerLink | null;
  io: ChannelIO | null;
  receiver: TransferReceiver | null;
  tracker: ProgressTracker | null;
  target: SaveTarget | null;
  rtcConfig: RTCConfiguration;
  resumePhase: ReceiverPhase | null;
}

const POLL_INTERVAL_MS = 3_000;
const READY_INTERVAL_MS = 2_000;

const INITIAL: ReceiverSnapshot = {
  phase: "entering",
  code: null,
  manifest: null,
  capabilities: { directory: false, browserStorage: false },
  target: null,
  choosingTarget: false,
  storageNotice: null,
  savedFiles: [],
  route: "unknown",
  progress: null,
  error: null,
};

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export class ReceiverController extends ObservableStore<ReceiverSnapshot> {
  private run: ReceiverRun | null = null;
  private windowListenersAttached = false;
  /** Target of the last completed transfer, kept so its download links stay valid. */
  private completedTarget: SaveTarget | null = null;

  constructor() {
    super(INITIAL);
  }

  getServerSnapshot = (): ReceiverSnapshot => INITIAL;

  /** Refresh browser capability flags (client-only). */
  detectCapabilities(): void {
    this.update({ capabilities: detectSaveCapabilities() });
  }

  async join(code: string, token?: string): Promise<void> {
    if (this.snapshot.phase !== "entering" || !isValidSessionCode(code)) return;
    this.releaseCompleted();
    const run = this.newRun();
    this.update({ code, error: null, manifest: null, savedFiles: [], progress: null, target: null, storageNotice: null, route: "unknown" }, false);
    this.setPhase("joining");

    try {
      const joined = await sessionApi.joinSession(code, token);
      if (!this.isCurrent(run)) return;
      run.credentials = { requestId: joined.requestId, receiverSecret: joined.receiverSecret };
      run.rtcConfig = toRtcConfiguration(joined.iceServers);

      const channel = openSignalingChannel(joined.channel);
      run.channel = channel;
      channel.onMessage((message) => this.handleSignal(run, message));
      await channel.connect();
      if (!this.isCurrent(run)) return;

      this.attachWindowListeners();
      if (!run.accepted) this.setPhase("awaiting-approval");
      this.schedulePoll(run);
    } catch (error) {
      if (!this.isCurrent(run)) return;
      if (run.credentials) void sessionApi.cancelRequest(run.credentials).catch(() => undefined);
      this.teardown();
      const expired = error instanceof ApiError && (error.code === "expired" || error.status === 410);
      const notFound = error instanceof ApiError && (error.code === "not_found" || error.code === "invalid_input");
      if (expired) {
        this.update({ error: { code: "expired", message: error.message } }, false);
        this.setPhase("expired");
      } else if (notFound) {
        // Stay on the code screen with an inline error.
        this.update({ error: { code: "invalid_code", message: (error as ApiError).message } }, false);
        this.setPhase("entering");
      } else {
        this.update({ error: { code: "join_failed", message: describeError(error, "Couldn't join the session.") } }, false);
        this.setPhase("failed");
      }
    }
  }

  /**
   * Choose where to save and start the transfer. Must be called directly from
   * a click handler so the folder picker keeps its user activation.
   */
  async chooseDestination(kind: SaveTargetKind): Promise<void> {
    const run = this.run;
    if (!run?.receiver || this.snapshot.phase !== "reviewing" || this.snapshot.choosingTarget) return;
    this.update({ choosingTarget: true });

    let target: SaveTarget;
    try {
      if (kind === "directory") target = await DirectorySaveTarget.pick();
      else if (kind === "browser-storage") target = await BrowserStorageSaveTarget.create();
      else target = new MemorySaveTarget();
    } catch (error) {
      if (!this.isCurrent(run)) return;
      const dismissed = error instanceof DOMException && error.name === "AbortError";
      this.update({
        choosingTarget: false,
        storageNotice: dismissed ? this.snapshot.storageNotice : describeError(error, "Couldn't open that location."),
      });
      return;
    }
    if (!this.isCurrent(run) || this.snapshot.phase !== "reviewing") {
      void target.dispose(false);
      return;
    }

    run.target = target;
    try {
      run.receiver.begin(target);
    } catch (error) {
      this.failRun(run, "transfer_failed", describeError(error, "Couldn't start the transfer."));
      return;
    }
    run.tracker?.start();
    this.update({ choosingTarget: false, target: { kind: target.kind, label: target.label } }, false);
    this.setPhase("transferring");
  }

  /** Refuse the offered files after seeing the list. */
  decline(): void {
    const run = this.run;
    if (!run || this.snapshot.phase !== "reviewing") return;
    run.receiver?.abort("The receiver declined the files.");
    this.finishRun(run, "cancelled", null);
  }

  cancel(): void {
    const run = this.run;
    const { phase } = this.snapshot;
    if (!run || isReceiverTerminal(phase) || phase === "entering") return;

    if (phase === "joining" || phase === "awaiting-approval") {
      if (run.credentials) void sessionApi.cancelRequest(run.credentials).catch(() => undefined);
      this.teardown();
      this.update({ error: null, code: null }, false);
      this.setPhase("entering");
      return;
    }
    const reason = "The receiver cancelled the transfer.";
    run.receiver?.abort(reason);
    void run.channel?.send({ v: 1, type: "cancel", from: "receiver", reason }).catch(() => undefined);
    this.finishRun(run, "cancelled", null);
  }

  /** Back to the code screen. */
  reset(): void {
    if (!isReceiverTerminal(this.snapshot.phase)) return;
    this.teardown();
    this.releaseCompleted();
    this.update({ ...INITIAL, capabilities: this.snapshot.capabilities }, false);
    this.setPhase("entering");
  }

  dismissError(): void {
    if (this.snapshot.error && this.snapshot.phase === "entering") this.update({ error: null });
  }

  dispose(): void {
    const run = this.run;
    if (run) {
      if (isReceiverLive(this.snapshot.phase)) run.receiver?.abort("The receiver left the page.");
      else if (run.credentials && !run.accepted) sessionApi.cancelRequestBeacon(run.credentials);
    }
    this.teardown();
    this.releaseCompleted();
    this.detachWindowListeners();
  }

  // ------------------------------------------------------------- internals

  private newRun(): ReceiverRun {
    this.teardown();
    this.run = {
      credentials: null,
      channel: null,
      pollTimer: null,
      readyTimer: null,
      accepted: false,
      offerSeen: false,
      peer: null,
      io: null,
      receiver: null,
      tracker: null,
      target: null,
      rtcConfig: { iceServers: [] },
      resumePhase: null,
    };
    return this.run;
  }

  private isCurrent(run: ReceiverRun): boolean {
    return this.run === run;
  }

  private setPhase(phase: ReceiverPhase): boolean {
    const from = this.snapshot.phase;
    if (from === phase) {
      this.emit();
      return true;
    }
    if (!canReceiverTransition(from, phase)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[ziplink] ignored receiver transition ${from} → ${phase}`);
      }
      this.emit();
      return false;
    }
    this.update({ phase });
    return true;
  }

  private handleSignal(run: ReceiverRun, message: SignalMessage): void {
    if (!this.isCurrent(run)) return;
    switch (message.type) {
      case "accept":
        this.onAccepted(run);
        break;
      case "reject":
        if (!run.accepted) this.endBeforeTransfer(run, "rejected", message.reason ?? "The sender declined your request.");
        break;
      case "session-closed":
        if (!run.accepted) this.endBeforeTransfer(run, "expired", message.reason);
        break;
      case "offer":
        run.offerSeen = true;
        this.stopReadyAnnouncements(run);
        run.peer?.handleSignal(message);
        break;
      case "ice":
        run.peer?.handleSignal(message);
        break;
      case "cancel":
        if (message.from === "sender") this.peerCancelled(run, message.reason);
        break;
      default:
        break;
    }
  }

  private onAccepted(run: ReceiverRun): void {
    if (run.accepted) return;
    run.accepted = true;
    if (run.pollTimer) clearTimeout(run.pollTimer);
    run.pollTimer = null;
    this.setPhase("connecting");

    const channel = run.channel;
    if (!channel) return;
    const peer = new PeerLink({
      role: "receiver",
      rtcConfig: run.rtcConfig,
      sendSignal: (message) => channel.send(message),
      onStateChange: (state, error) => this.handlePeerState(run, state, error?.message),
      onDataChannel: (dataChannel) => this.handleDataChannel(run, dataChannel),
      onRoute: (route) => {
        if (this.isCurrent(run)) this.update({ route });
      },
    });
    run.peer = peer;
    peer.start();

    // Announce readiness until the sender's offer arrives (covers lost messages).
    const announce = () => void channel.send({ v: 1, type: "ready", from: "receiver" }).catch(() => undefined);
    announce();
    run.readyTimer = setInterval(() => {
      if (run.offerSeen || !this.isCurrent(run)) this.stopReadyAnnouncements(run);
      else announce();
    }, READY_INTERVAL_MS);
  }

  private stopReadyAnnouncements(run: ReceiverRun): void {
    if (run.readyTimer) clearInterval(run.readyTimer);
    run.readyTimer = null;
  }

  private schedulePoll(run: ReceiverRun): void {
    if (run.pollTimer) clearTimeout(run.pollTimer);
    run.pollTimer = setTimeout(() => void this.poll(run), POLL_INTERVAL_MS);
  }

  /** Fallback in case a decision broadcast was missed. */
  private async poll(run: ReceiverRun): Promise<void> {
    if (!this.isCurrent(run) || run.accepted || !run.credentials) return;
    try {
      const { status } = await sessionApi.requestStatus(run.credentials);
      if (!this.isCurrent(run) || run.accepted) return;
      if (status === "accepted") return this.onAccepted(run);
      if (status === "rejected") return this.endBeforeTransfer(run, "rejected", "The sender declined your request.");
      if (status === "expired" || status === "cancelled") {
        return this.endBeforeTransfer(run, "expired", "This session has ended.");
      }
    } catch (error) {
      if (!this.isCurrent(run)) return;
      if (error instanceof ApiError && error.status === 404) {
        return this.endBeforeTransfer(run, "expired", "This session has ended.");
      }
    }
    this.schedulePoll(run);
  }

  private endBeforeTransfer(run: ReceiverRun, phase: "rejected" | "expired", message: string): void {
    if (!this.isCurrent(run)) return;
    this.teardown();
    this.update({ error: { code: phase, message } }, false);
    this.setPhase(phase);
  }

  private handlePeerState(run: ReceiverRun, state: PeerLinkState, message?: string): void {
    if (!this.isCurrent(run)) return;
    const { phase } = this.snapshot;
    if (state === "reconnecting" && isReceiverLive(phase) && phase !== "reconnecting") {
      run.resumePhase = phase;
      this.setPhase("reconnecting");
    } else if (state === "connected" && phase === "reconnecting" && run.resumePhase) {
      this.setPhase(run.resumePhase);
      run.resumePhase = null;
    } else if (state === "failed" && !run.receiver?.isFinished) {
      this.failRun(run, "connection_failed", message ?? "The connection to the sender failed.");
    }
  }

  private handleDataChannel(run: ReceiverRun, dataChannel: RTCDataChannel): void {
    if (!this.isCurrent(run) || run.io) return;
    const io = new ChannelIO(dataChannel);
    const receiver = new TransferReceiver(io, {
      onManifest: (manifest) => void this.onManifest(run, manifest),
      onFileStart: (index) => {
        if (!this.isCurrent(run) || !run.tracker) return;
        run.tracker.markActive(index);
        this.update({ progress: run.tracker.snapshot() }, false);
      },
      onProgress: ({ writtenBytes, fileIndex, fileWrittenBytes }) => {
        if (!this.isCurrent(run) || !run.tracker) return;
        run.tracker.update(writtenBytes, fileIndex, fileWrittenBytes);
        this.update({ progress: run.tracker.snapshot() }, false);
      },
      onFileSaved: (file) => {
        if (!this.isCurrent(run) || !run.tracker) return;
        run.tracker.markDone(file.index, file.name);
        this.update({ progress: run.tracker.snapshot(), savedFiles: [...this.snapshot.savedFiles, file] }, false);
      },
      onFinalizing: () => {
        if (this.isCurrent(run)) this.setPhase("finalizing");
      },
      onComplete: (files) => this.complete(run, files),
      onError: (error) => {
        if (!this.isCurrent(run)) return;
        if (error instanceof TransferAbortedError && error.byPeer) this.peerCancelled(run, error.message);
        else this.failRun(run, "transfer_failed", error.message);
      },
    });
    run.io = io;
    run.receiver = receiver;

    io.onControl((message) => {
      receiver.handleControl(message);
      if (message.t === "cancel" && this.isCurrent(run)) this.peerCancelled(run, message.reason);
    });
    io.onBinary((data) => receiver.handleBinary(data));
    io.onInvalid((reason) => {
      receiver.abort(reason);
      this.failRun(run, "protocol_error", reason);
    });
    io.onClose(() => {
      if (!this.isCurrent(run) || receiver.isFinished || isReceiverTerminal(this.snapshot.phase)) return;
      this.failRun(run, "peer_disconnected", "The sender disconnected before the transfer finished.");
    });
  }

  private async onManifest(run: ReceiverRun, manifest: ManifestInfo): Promise<void> {
    if (!this.isCurrent(run)) return;
    run.tracker = new ProgressTracker(manifest.files);
    const capabilities = detectSaveCapabilities();
    let storageNotice: string | null = null;

    if (!capabilities.directory && capabilities.browserStorage) {
      const free = await estimateFreeBrowserStorage();
      if (!this.isCurrent(run)) return;
      if (free !== null && free < manifest.totalBytes) {
        storageNotice = `This browser reports about ${formatBytes(free)} of available storage, which may not be enough for ${formatBytes(manifest.totalBytes)}.`;
      }
    } else if (!capabilities.directory && !capabilities.browserStorage && manifest.totalBytes > MEMORY_TARGET_WARN_BYTES) {
      storageNotice = `This browser can't stream files to disk, so ${formatBytes(manifest.totalBytes)} must be held in memory until each file completes. Very large transfers may fail; a Chromium-based desktop browser handles them best.`;
    }

    this.update({ manifest, capabilities, storageNotice, progress: run.tracker.snapshot() }, false);
    this.setPhase("reviewing");
  }

  private complete(run: ReceiverRun, files: SavedFile[]): void {
    if (!this.isCurrent(run)) return;
    run.tracker?.finish();
    this.completedTarget = run.target;
    run.target = null; // keep download links alive past teardown
    this.update({ progress: run.tracker?.snapshot() ?? null, savedFiles: files }, false);
    if (this.snapshot.phase !== "finalizing") this.setPhase("finalizing");
    this.setPhase("completed");
    // Give the done-ack time to flush; the sender closes the connection itself.
    setTimeout(() => {
      if (this.isCurrent(run)) this.teardown();
    }, 3_000);
  }

  private peerCancelled(run: ReceiverRun, reason: string): void {
    if (!this.isCurrent(run) || isReceiverTerminal(this.snapshot.phase)) return;
    this.finishRun(run, "cancelled", { code: "peer_cancelled", message: reason || "The sender cancelled the transfer." });
  }

  private failRun(run: ReceiverRun, code: string, message: string): void {
    if (!this.isCurrent(run) || isReceiverTerminal(this.snapshot.phase)) return;
    run.receiver?.abort(message);
    this.finishRun(run, "failed", { code, message });
  }

  private finishRun(run: ReceiverRun, phase: "failed" | "cancelled", error: PhaseError | null): void {
    if (!this.isCurrent(run)) return;
    if (run.tracker) {
      run.tracker.markActiveFailed();
      run.tracker.finish();
    }
    this.teardown();
    this.update({ error, choosingTarget: false, progress: run.tracker?.snapshot() ?? this.snapshot.progress }, false);
    this.setPhase(phase);
  }

  private releaseCompleted(): void {
    void this.completedTarget?.dispose(false);
    this.completedTarget = null;
  }

  private teardown(): void {
    const run = this.run;
    this.run = null;
    if (!run) return;
    if (run.pollTimer) clearTimeout(run.pollTimer);
    this.stopReadyAnnouncements(run);
    run.io?.dispose();
    run.peer?.close();
    run.channel?.close();
    this.detachWindowListeners();
  }

  // --------------------------------------------------------- page lifecycle

  private readonly onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return;
    const run = this.run;
    if (!run) return;
    if (isReceiverLive(this.snapshot.phase)) {
      run.receiver?.abort("The receiver closed the page.");
    } else if (run.credentials && !run.accepted) {
      sessionApi.cancelRequestBeacon(run.credentials);
    }
  };

  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (isReceiverLive(this.snapshot.phase)) event.preventDefault();
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
