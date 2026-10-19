import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Receiver withdraws a pending join request. */
export async function POST(request: Request, ctx: RouteContext<"/api/requests/[requestId]/cancel">) {
  try {
    const { requestId } = await ctx.params;
    const body = await readJson(request);
    getRuntime().sessions.cancelRequest(requestId, body.receiverSecret);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
