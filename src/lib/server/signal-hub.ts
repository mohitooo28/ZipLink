import "server-only";

/**
 * In-process publish/subscribe for signaling messages, delivered to browsers
 * over Server-Sent Events. Only channels registered by the session service
 * exist, so the hub cannot be used as a general-purpose relay.
 *
 * Each channel keeps a short backlog with increasing ids. A subscriber that
 * connects late (or an EventSource that reconnects with Last-Event-ID) gets
 * the messages it missed, which removes subscribe/publish races.
 */

export type ChannelKind = "sender" | "request";

export interface HubMessage {
  id: number;
  data: string;
  at: number;
}

interface Subscriber {
  deliver: (message: HubMessage) => void;
  close: () => void;
}

interface ChannelState {
  kind: ChannelKind;
  subscribers: Set<Subscriber>;
  backlog: HubMessage[];
  nextId: number;
}

const BACKLOG_LIMIT = 200;
const BACKLOG_TTL_MS = 5 * 60_000;
export const MAX_SUBSCRIBERS_PER_CHANNEL = 4;

export class SignalHub {
  private readonly channels = new Map<string, ChannelState>();

  constructor(private readonly now: () => number = Date.now) {}

  register(name: string, kind: ChannelKind): void {
    if (!this.channels.has(name)) {
      this.channels.set(name, { kind, subscribers: new Set(), backlog: [], nextId: 1 });
    }
  }

  unregister(name: string): void {
    const channel = this.channels.get(name);
    if (!channel) return;
    this.channels.delete(name);
    for (const subscriber of channel.subscribers) subscriber.close();
    channel.subscribers.clear();
  }

  kindOf(name: string): ChannelKind | null {
    return this.channels.get(name)?.kind ?? null;
  }

  subscriberCount(name: string): number {
    return this.channels.get(name)?.subscribers.size ?? 0;
  }

  /**
   * Returns an unsubscribe function, or a reason string when the channel does
   * not exist or is full.
   */
  subscribe(
    name: string,
    deliver: (message: HubMessage) => void,
    close: () => void,
    lastEventId = 0,
  ): (() => void) | "not_found" | "full" {
    const channel = this.channels.get(name);
    if (!channel) return "not_found";
    if (channel.subscribers.size >= MAX_SUBSCRIBERS_PER_CHANNEL) return "full";

    const subscriber: Subscriber = { deliver, close };
    channel.subscribers.add(subscriber);
    this.prune(channel);
    for (const message of channel.backlog) {
      if (message.id > lastEventId) deliver(message);
    }
    return () => {
      channel.subscribers.delete(subscriber);
    };
  }

  publish(name: string, payload: unknown): boolean {
    const channel = this.channels.get(name);
    if (!channel) return false;
    const message: HubMessage = {
      id: channel.nextId++,
      data: JSON.stringify(payload),
      at: this.now(),
    };
    channel.backlog.push(message);
    this.prune(channel);
    for (const subscriber of channel.subscribers) {
      try {
        subscriber.deliver(message);
      } catch {
        // A broken stream is cleaned up by its own abort handler.
      }
    }
    return true;
  }

  private prune(channel: ChannelState): void {
    const cutoff = this.now() - BACKLOG_TTL_MS;
    while (
      channel.backlog.length > 0 &&
      (channel.backlog.length > BACKLOG_LIMIT || channel.backlog[0].at < cutoff)
    ) {
      channel.backlog.shift();
    }
  }
}
