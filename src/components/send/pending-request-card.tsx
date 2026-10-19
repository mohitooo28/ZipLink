import { Check, LoaderCircle, MonitorSmartphone, X } from "lucide-react";
import type { PendingRequestSummary } from "@/types/session";
import { Button } from "@/components/ui/button";

interface PendingRequestCardProps {
  request: PendingRequestSummary;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function PendingRequestCard({ request, busy, disabled, onAccept, onReject }: PendingRequestCardProps) {
  return (
    <div
      className="animate-fade-in flex flex-col gap-4 rounded-2xl border border-accent-line bg-surface p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center"
      data-testid="pending-request"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <MonitorSmartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{request.deviceLabel}</p>
          <p className="text-sm text-muted">Wants to receive your files. Only accept devices you recognise.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button variant="secondary" className="rounded-full" onClick={onReject} disabled={disabled} aria-label={`Reject request from ${request.deviceLabel}`}>
          <X aria-hidden="true" />
          Reject
        </Button>
        <Button className="rounded-full" onClick={onAccept} disabled={disabled} aria-label={`Accept request from ${request.deviceLabel}`}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Accept
        </Button>
      </div>
    </div>
  );
}
