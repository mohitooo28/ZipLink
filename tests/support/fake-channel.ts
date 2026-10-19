import type { DataChannelLike } from "@/lib/webrtc/data-channel";

type Listener = (event: Event) => void;

/**
 * In-memory stand-in for a connected pair of RTCDataChannels. Messages are
 * delivered asynchronously in order; `bufferedAmount` rises on send and falls
 * on delivery, firing `bufferedamountlow` like a real channel.
 */
export class FakeChannel implements DataChannelLike {
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType: BinaryType = "arraybuffer";
  peer: FakeChannel | null = null;
  maxBufferedAmount = 0;
  sentMessages = 0;
  /** Optional per-message delay to simulate a slow link. */
  deliveryDelayMs = 0;
  /** Optional hook to tamper with outgoing data. */
  transform: ((data: string | ArrayBuffer) => string | ArrayBuffer) | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private chain: Promise<void> = Promise.resolve();

  static pair(): [FakeChannel, FakeChannel] {
    const a = new FakeChannel();
    const b = new FakeChannel();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== "open") throw new DOMException("Channel not open", "InvalidStateError");
    const payload = this.transform ? this.transform(data) : data;
    const size = typeof payload === "string" ? payload.length : payload.byteLength;
    // Copy so later mutation of the sender's buffer cannot leak through.
    const copy = typeof payload === "string" ? payload : payload.slice(0);
    this.bufferedAmount += size;
    this.sentMessages += 1;
    this.maxBufferedAmount = Math.max(this.maxBufferedAmount, this.bufferedAmount);
    const delay = this.deliveryDelayMs;
    this.chain = this.chain.then(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            const before = this.bufferedAmount;
            this.bufferedAmount -= size;
            if (before > this.bufferedAmountLowThreshold && this.bufferedAmount <= this.bufferedAmountLowThreshold) {
              this.dispatch("bufferedamountlow", new Event("bufferedamountlow"));
            }
            if (this.peer?.readyState === "open") {
              this.peer.dispatch("message", new MessageEvent("message", { data: copy }));
            }
            resolve();
          }, delay);
        }),
    );
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.dispatch("close", new Event("close"));
    const peer = this.peer;
    if (peer && peer.readyState !== "closed") {
      setTimeout(() => peer.close(), 0);
    }
  }
}
