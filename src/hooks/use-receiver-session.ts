"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ReceiverController } from "@/lib/session/receiver-controller";

/** One ReceiverController per mounted receive page. */
export function useReceiverSession() {
  const [controller] = useState(() => new ReceiverController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => {
    controller.detectCapabilities();
    return () => controller.dispose();
  }, [controller]);
  return { controller, snapshot };
}
