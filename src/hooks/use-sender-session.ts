"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { SenderController } from "@/lib/session/sender-controller";

/**
 * One SenderController per mounted send page. The controller owns all
 * network resources; React only renders its snapshots.
 */
export function useSenderSession() {
  const [controller] = useState(() => new SenderController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  // dispose() is idempotent and only releases resources of an active session,
  // so React's development double-mount is harmless.
  useEffect(() => () => controller.dispose(), [controller]);
  return { controller, snapshot };
}
