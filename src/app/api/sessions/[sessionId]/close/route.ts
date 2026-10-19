import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Sender ends the session (also sent with navigator.sendBeacon when the tab closes). */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]/close">) {
  try {
    const { sessionId } = await ctx.params;
    const body = await readJson(request);
    getRuntime().sessions.closeSession(sessionId, body.senderSecret);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
