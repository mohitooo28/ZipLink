import "server-only";
import type { IceServerConfig } from "@/types/session";
import type { ServerConfig } from "./config";
import { turnRestCredentials } from "./crypto";

/**
 * ICE servers handed to session participants. TURN credentials are only
 * returned to authorized senders/receivers, never from a public endpoint.
 */
export function buildIceServers(config: ServerConfig, now = Date.now()): IceServerConfig[] {
  const servers: IceServerConfig[] = [];
  if (config.stunUrls.length > 0) servers.push({ urls: config.stunUrls });

  if (config.turnUrls.length > 0) {
    if (config.turnSecret) {
      servers.push({
        urls: config.turnUrls,
        ...turnRestCredentials(config.turnSecret, config.turnTtlSeconds, now),
      });
    } else if (config.turnUsername && config.turnCredential) {
      servers.push({
        urls: config.turnUrls,
        username: config.turnUsername,
        credential: config.turnCredential,
      });
    }
  }
  return servers;
}
