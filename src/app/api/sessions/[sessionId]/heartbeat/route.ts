import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Sender keep-alive; also returns pending join requests as a fallback to push signaling. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]/heartbeat">) {
  try {
    const { sessionId } = await ctx.params;
    const body = await readJson(request);
    return json(getRuntime().sessions.heartbeat(sessionId, body.senderSecret));
  } catch (error) {
    return errorResponse(error);
  }
}
