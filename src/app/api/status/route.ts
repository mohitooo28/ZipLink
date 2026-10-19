import { connection } from "next/server";
import type { ServiceStatusResponse } from "@/types/session";
import { configIssues, getServerConfig, isTurnConfigured } from "@/lib/server/config";
import { json } from "@/lib/server/http";

/** Readiness information for the landing page. */
export async function GET() {
  await connection();
  const config = getServerConfig();
  const body: ServiceStatusResponse = {
    ready: true,
    turnConfigured: isTurnConfigured(config),
    issues: configIssues(config),
  };
  return json(body);
}
