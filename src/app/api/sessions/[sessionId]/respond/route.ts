import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Sender accepts or rejects a pending join request. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]/respond">) {
  try {
    const { sessionId } = await ctx.params;
    const body = await readJson(request);
    return json(getRuntime().sessions.respond(sessionId, body.senderSecret, body.requestId, body.decision));
  } catch (error) {
    return errorResponse(error);
  }
}
