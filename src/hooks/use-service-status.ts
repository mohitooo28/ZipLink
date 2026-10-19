"use client";

import { useEffect, useState } from "react";
import { sessionApi } from "@/lib/signaling/session-service";
import { isWebRtcSupported } from "@/lib/webrtc/ice-configuration";

export type ServiceState =
  | { kind: "checking" }
  | { kind: "ready"; turnConfigured: boolean }
  | { kind: "unsupported" }
  | { kind: "offline"; message: string };

/** Combined readiness of this browser (WebRTC) and the signaling service. */
export function useServiceStatus(): ServiceState {
  const [state, setState] = useState<ServiceState>({ kind: "checking" });

  useEffect(() => {
    let active = true;
    if (!isWebRtcSupported()) {
      // Deferred so the state update does not happen synchronously in the effect.
      queueMicrotask(() => active && setState({ kind: "unsupported" }));
      return () => {
        active = false;
      };
    }
    sessionApi
      .status()
      .then((status) => {
        if (active) setState({ kind: "ready", turnConfigured: status.turnConfigured });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: "offline",
            message: error instanceof Error ? error.message : "The signaling service is unreachable.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
