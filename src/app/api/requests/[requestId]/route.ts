import { errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Receiver polls the status of its join request (fallback to push signaling). */
export async function POST(request: Request, ctx: RouteContext<"/api/requests/[requestId]">) {
  try {
    const { requestId } = await ctx.params;
    const body = await readJson(request);
    return json(getRuntime().sessions.requestStatus(requestId, body.receiverSecret));
  } catch (error) {
    return errorResponse(error);
  }
}
