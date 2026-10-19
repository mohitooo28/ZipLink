import type { IceServerConfig } from "@/types/session";
import type { ConnectionRoute } from "@/types/transfer";

/** Convert server-provided ICE config into an RTCConfiguration. */
export function toRtcConfiguration(servers: IceServerConfig[]): RTCConfiguration {
  return {
    iceServers: servers.map((server) => ({
      urls: server.urls,
      ...(server.username ? { username: server.username } : {}),
      ...(server.credential ? { credential: server.credential } : {}),
    })),
    // Gather a small pool up front so the first offer carries candidates sooner.
    iceCandidatePoolSize: 2,
  };
}

interface StatsLike {
  forEach(callback: (report: Record<string, unknown>) => void): void;
  get(id: string): Record<string, unknown> | undefined;
}

/**
 * Inspect getStats() output to tell whether the selected candidate pair goes
 * through a TURN relay. Handles both the spec (`selectedCandidatePairId` on
 * the transport) and Firefox (`selected` on the pair).
 */
export function routeFromStats(stats: StatsLike): ConnectionRoute {
  let pair: Record<string, unknown> | undefined;

  stats.forEach((report) => {
    if (report.type === "transport" && typeof report.selectedCandidatePairId === "string") {
      pair = stats.get(report.selectedCandidatePairId) ?? pair;
    }
  });
  if (!pair) {
    stats.forEach((report) => {
      if (report.type !== "candidate-pair") return;
      if (report.selected === true || (report.nominated === true && report.state === "succeeded")) {
        pair = pair ?? report;
      }
    });
  }
  if (!pair) return "unknown";

  const local = typeof pair.localCandidateId === "string" ? stats.get(pair.localCandidateId) : undefined;
  const remote = typeof pair.remoteCandidateId === "string" ? stats.get(pair.remoteCandidateId) : undefined;
  if (!local && !remote) return "unknown";
  return local?.candidateType === "relay" || remote?.candidateType === "relay" ? "relay" : "direct";
}

export function isWebRtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    "createDataChannel" in window.RTCPeerConnection.prototype
  );
}
