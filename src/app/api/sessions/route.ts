import { clientContext, errorResponse, json } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

/** Create a sharing session and reserve a unique five-digit code. */
export async function POST(request: Request) {
  try {
    return json(getRuntime().sessions.createSession(clientContext(request)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
