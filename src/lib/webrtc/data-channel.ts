import type { ControlMessage } from "@/types/transfer";
import { encodeControl } from "@/lib/transfer/chunk-protocol";
import { parseControlMessage } from "@/lib/utils/validate-transfer-message";

/** The subset of RTCDataChannel the transfer engine relies on (fakeable in tests). */
export interface DataChannelLike {
  readonly readyState: RTCDataChannelState;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: BinaryType;
  send(data: string | ArrayBuffer): void;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export class ChannelClosedError extends Error {
  constructor(message = "The connection to the other device was closed.") {
    super(message);
    this.name = "ChannelClosedError";
  }
}

export interface ChannelIOOptions {
  /** Stop queueing new data above this many buffered bytes. */
  highWaterMark?: number;
  /** `bufferedamountlow` fires once the buffer drains below this. */
  lowWaterMark?: number;
}

/** Fallback poll in case an engine misses a bufferedamountlow event. */
const DRAIN_POLL_MS = 100;

/**
 * Message framing and backpressure for a DataChannel. Control messages are
 * JSON strings; file data is binary. `sendBinary` never lets more than
 * `highWaterMark` bytes accumulate in the channel's send buffer.
 */
export class ChannelIO {
  private readonly highWaterMark: number;
  private controlHandler: (message: ControlMessage) => void = () => {};
  private binaryHandler: (data: ArrayBuffer) => void = () => {};
  private invalidHandler: (reason: string) => void = () => {};
  private closeHandlers = new Set<() => void>();
  private drainWaiters = new Set<() => void>();
  private closed = false;
  private readonly listeners: Array<[string, (event: Event) => void]> = [];

  constructor(
    private readonly channel: DataChannelLike,
    options: ChannelIOOptions = {},
  ) {
    this.highWaterMark = options.highWaterMark ?? 4 * 1024 * 1024;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = options.lowWaterMark ?? 1024 * 1024;

    this.listen("message", (event) => this.handleMessage(event as MessageEvent));
    this.listen("bufferedamountlow", () => this.wakeDrainWaiters());
    this.listen("close", () => this.markClosed());
    this.listen("error", () => this.markClosed());
  }

  get isOpen(): boolean {
    return !this.closed && this.channel.readyState === "open";
  }

  onControl(handler: (message: ControlMessage) => void): void {
    this.controlHandler = handler;
  }

  onBinary(handler: (data: ArrayBuffer) => void): void {
    this.binaryHandler = handler;
  }

  onInvalid(handler: (reason: string) => void): void {
    this.invalidHandler = handler;
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  sendControl(message: ControlMessage): void {
    this.assertOpen();
    this.channel.send(encodeControl(message));
  }

  async sendBinary(data: ArrayBuffer): Promise<void> {
    await this.waitForCapacity(data.byteLength);
    this.assertOpen();
    this.channel.send(data);
  }

  /** Resolve once `bytes` more can be queued without exceeding the high-water mark. */
  async waitForCapacity(bytes = 0): Promise<void> {
    while (this.channel.bufferedAmount + bytes > this.highWaterMark) {
      this.assertOpen();
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.drainWaiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, DRAIN_POLL_MS);
        this.drainWaiters.add(done);
      });
    }
  }

  close(): void {
    if (!this.closed) {
      try {
        this.channel.close();
      } catch {
        // ignore
      }
    }
    this.markClosed();
  }

  /** Detach listeners without closing the underlying channel. */
  dispose(): void {
    for (const [type, listener] of this.listeners) this.channel.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.closeHandlers.clear();
    this.wakeDrainWaiters();
  }

  private listen(type: string, listener: (event: Event) => void): void {
    this.channel.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }

  private handleMessage(event: MessageEvent): void {
    const { data } = event;
    if (typeof data === "string") {
      const message = parseControlMessage(data);
      if (message) this.controlHandler(message);
      else this.invalidHandler("Received a malformed control message.");
    } else if (data instanceof ArrayBuffer) {
      this.binaryHandler(data);
    } else {
      this.invalidHandler("Received an unsupported message type.");
    }
  }

  private assertOpen(): void {
    if (this.closed || this.channel.readyState !== "open") throw new ChannelClosedError();
  }

  private wakeDrainWaiters(): void {
    const waiters = [...this.drainWaiters];
    this.drainWaiters.clear();
    for (const wake of waiters) wake();
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.wakeDrainWaiters();
    for (const handler of [...this.closeHandlers]) handler();
  }
}
