import type { ChannelStatus, SignalMessage } from "@/types/signaling";
import { parseSignalMessage } from "@/lib/utils/validate-transfer-message";

/**
 * A signaling channel shared by the two peers of one request (or used by the
 * server to reach a sender). Messages are delivered over Server-Sent Events
 * and published with plain POST requests.
 */
export interface SignalingChannel {
  readonly name: string;
  /** Resolves once the subscription is live on the server. */
  connect(): Promise<void>;
  send(message: SignalMessage): Promise<void>;
  onMessage(handler: (message: SignalMessage) => void): () => void;
  onStatus(handler: (status: ChannelStatus) => void): () => void;
  close(): void;
}

const CONNECT_TIMEOUT_MS = 15_000;
const SEND_ATTEMPTS = 3;

export class SignalingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalingError";
  }
}

export class SseSignalingChannel implements SignalingChannel {
  private source: EventSource | null = null;
  private status: ChannelStatus = "connecting";
  private lastId = 0;
  private closed = false;
  private readonly messageHandlers = new Set<(message: SignalMessage) => void>();
  private readonly statusHandlers = new Set<(status: ChannelStatus) => void>();
  private connecting: Promise<void> | null = null;

  constructor(readonly name: string) {}

  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new SignalingError("Channel closed"));
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/signal/${encodeURIComponent(this.name)}`);
      this.source = source;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new SignalingError("Timed out connecting to the signaling service."));
      }, CONNECT_TIMEOUT_MS);

      source.addEventListener("ready", () => {
        this.setStatus("connected");
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });

      source.addEventListener("fatal", () => {
        this.close();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new SignalingError("This session is no longer available."));
        }
      });

      source.onmessage = (event: MessageEvent<string>) => {
        const id = Number(event.lastEventId);
        if (Number.isFinite(id) && id > 0) {
          if (id <= this.lastId) return; // duplicate after a reconnect
          this.lastId = id;
        }
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        const message = parseSignalMessage(data);
        if (!message) return;
        for (const handler of this.messageHandlers) handler(message);
      };

      source.onerror = () => {
        if (this.closed) return;
        if (source.readyState === EventSource.CLOSED) {
          // The server refused the stream (e.g. channel expired): no auto-retry.
          this.close();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new SignalingError("Couldn't connect to the signaling service."));
          }
          return;
        }
        // EventSource retries on its own and resumes with Last-Event-ID.
        this.setStatus("reconnecting");
      };
    });
    return this.connecting;
  }

  async send(message: SignalMessage): Promise<void> {
    if (this.closed) throw new SignalingError("Channel closed");
    let lastError: unknown = null;
    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`/api/signal/${encodeURIComponent(this.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          cache: "no-store",
        });
        if (response.ok) return;
        if (response.status < 500) {
          throw new SignalingError(`Signaling rejected the message (${response.status}).`);
        }
        lastError = new SignalingError(`Signaling unavailable (${response.status}).`);
      } catch (error) {
        if (error instanceof SignalingError) throw error;
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new SignalingError("Couldn't send signaling message.");
  }

  onMessage(handler: (message: SignalMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: (status: ChannelStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.source?.close();
    this.source = null;
    this.setStatus("closed");
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }

  private setStatus(status: ChannelStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }
}

export function openSignalingChannel(name: string): SignalingChannel {
  return new SseSignalingChannel(name);
}
