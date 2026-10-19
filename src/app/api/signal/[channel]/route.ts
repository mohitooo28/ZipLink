import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";
import { ServiceError } from "@/lib/server/session-service";
import { parseSignalMessage } from "@/lib/utils/validate-transfer-message";

/**
 * Signaling transport. GET opens a Server-Sent Events stream for a channel;
 * POST publishes one message to it. Channel names are unguessable 128-bit
 * values handed out only to the session's participants.
 */

const KEEPALIVE_MS = 15_000;
const CHANNEL_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export async function GET(request: Request, ctx: RouteContext<"/api/signal/[channel]">) {
  const { channel } = await ctx.params;
  const { hub } = getRuntime();
  if (!CHANNEL_PATTERN.test(channel) || !hub.kindOf(channel)) {
    return json({ error: { code: "not_found", message: "Unknown channel." } }, 404);
  }

  const headerId = request.headers.get("last-event-id");
  const queryId = new URL(request.url).searchParams.get("after");
  const lastEventId = Math.max(0, Number(headerId ?? queryId ?? 0) || 0);

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      const result = hub.subscribe(
        channel,
        (message) => write(`id: ${message.id}\ndata: ${message.data}\n\n`),
        () => cleanup(),
        lastEventId,
      );
      if (typeof result === "string") {
        write(`event: fatal\ndata: ${JSON.stringify({ reason: result })}\n\n`);
        open = false;
        controller.close();
        return;
      }

      const keepalive = setInterval(() => write(": keepalive\n\n"), KEEPALIVE_MS);
      cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(keepalive);
        result();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup(), { once: true });
      write("retry: 2000\n\nevent: ready\ndata: {}\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression middleware from buffering the stream.
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/signal/[channel]">) {
  try {
    const { channel } = await ctx.params;
    if (!CHANNEL_PATTERN.test(channel)) throw new ServiceError("not_found", "Unknown channel.", 404);
    const body = await readJson(request);
    const message = parseSignalMessage(body.message);
    if (!message) throw new ServiceError("invalid_input", "Malformed signaling message.", 400);
    if (!getRuntime().sessions.publishFromClient(channel, message)) {
      throw new ServiceError("not_found", "Unknown channel.", 404);
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
