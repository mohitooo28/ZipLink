import { LoaderCircle, RefreshCw, ShieldCheck, Waypoints } from "lucide-react";
import type { ConnectionRoute } from "@/types/transfer";
import { cn } from "@/lib/utils/cn";

interface ConnectionStatusProps {
  title: string;
  detail?: string;
  /** Busy states show a spinner; reconnecting is highlighted as a warning. */
  tone?: "busy" | "active" | "warning";
  route?: ConnectionRoute;
  className?: string;
}

export function RouteBadge({ route }: { route: ConnectionRoute }) {
  if (route === "unknown") return null;
  const relay = route === "relay";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        relay ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
      )}
      title={
        relay
          ? "No direct path was found, so the encrypted connection is relayed through a TURN server."
          : "The devices are connected directly."
      }
    >
      {relay ? <Waypoints className="size-3" aria-hidden="true" /> : <ShieldCheck className="size-3" aria-hidden="true" />}
      {relay ? "Relayed via TURN" : "Direct peer-to-peer"}
    </span>
  );
}

/** Live status line; announced politely to assistive technology. */
export function ConnectionStatus({ title, detail, tone = "busy", route = "unknown", className }: ConnectionStatusProps) {
  return (
    <div className={cn("flex items-start gap-3", className)} role="status" aria-live="polite" data-testid="connection-status">
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
          tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent",
        )}
      >
        {tone === "warning" ? (
          <RefreshCw className="size-4 animate-spin [animation-duration:2s]" aria-hidden="true" />
        ) : tone === "busy" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{title}</p>
          <RouteBadge route={route} />
        </div>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </div>
  );
}
