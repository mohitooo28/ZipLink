import { clientContext, errorResponse, json, readJson } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Receiver asks to join the session identified by a code (and optional invitation token). */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    return json(getRuntime().sessions.joinSession({ code: body.code, token: body.token }, clientContext(request)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
