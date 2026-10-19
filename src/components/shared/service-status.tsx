"use client";

import { useServiceStatus } from "@/hooks/use-service-status";
import { cn } from "@/lib/utils/cn";

/** Pill showing whether this browser and the signaling service are ready. */
export function ServiceStatus({ className }: { className?: string }) {
  const state = useServiceStatus();

  const { tone, label } =
    state.kind === "ready"
      ? { tone: "bg-success", label: "Ready to connect" }
      : state.kind === "checking"
        ? { tone: "bg-muted", label: "Checking connection…" }
        : state.kind === "unsupported"
          ? { tone: "bg-danger", label: "This browser doesn't support WebRTC" }
          : { tone: "bg-danger", label: "Signaling service unreachable" };

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-2 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <span className="relative flex size-2">
        {state.kind === "ready" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", tone)} />
      </span>
      {label}
    </p>
  );
}
