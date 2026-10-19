"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, House, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmCancelDialog } from "@/components/shared/confirm-cancel-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { CompletionScreen } from "@/components/transfer/completion-screen";
import { ConnectionStatus } from "@/components/transfer/connection-status";
import { TransferProgress } from "@/components/transfer/transfer-progress";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSenderSession } from "@/hooks/use-sender-session";
import type { SenderPhase } from "@/lib/transfer/transfer-state-machine";
import { formatBytes } from "@/lib/utils/format-bytes";
import { FileComposer } from "./file-composer";
import { PendingRequestCard } from "./pending-request-card";
import { QRCodeCard } from "./qr-code-card";
import { ShareLinkButton } from "./share-link-button";
import { TransferCodeDisplay } from "./transfer-code-display";

const LIVE_STATUS: Partial<Record<SenderPhase, { title: string; detail: string; tone: "busy" | "active" | "warning" }>> = {
  connecting: {
    title: "Establishing peer-to-peer connection",
    detail: "Negotiating a direct, encrypted route between the two devices.",
    tone: "busy",
  },
  reviewing: {
    title: "Connected — waiting for the receiver",
    detail: "The receiver is reviewing the files and choosing where to save them.",
    tone: "active",
  },
  transferring: { title: "Transferring files", detail: "Keep this tab open until the transfer completes.", tone: "active" },
  finalizing: { title: "Finalizing files", detail: "Waiting for the receiver to finish saving.", tone: "busy" },
  reconnecting: {
    title: "Connection interrupted — reconnecting",
    detail: "The network changed or dropped. Trying to restore the connection…",
    tone: "warning",
  },
};

export function SendFlow() {
  const { controller, snapshot } = useSenderSession();
  const { phase, files, totalBytes, session, requests, respondingTo, progress, error, route } = snapshot;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const seenRequests = useRef(new Set<string>());

  // Announce new join requests even if the user is looking elsewhere.
  useEffect(() => {
    for (const request of requests) {
      if (seenRequests.current.has(request.requestId)) continue;
      seenRequests.current.add(request.requestId);
      toast.info(`${request.deviceLabel} wants to receive your files`);
    }
  }, [requests]);

  const start = () => void controller.startSharing(window.location.origin);
  const shareAgain = () => void controller.startSharing(window.location.origin);

  if (phase === "selecting" || phase === "creating") {
    return (
      <FileComposer
        files={files}
        totalBytes={totalBytes}
        busy={phase === "creating"}
        onAdd={(list) => controller.addFiles(list)}
        onRemove={(id) => controller.removeFile(id)}
        onClear={() => controller.clearFiles()}
        onStart={start}
      />
    );
  }

  if ((phase === "waiting" || phase === "request-pending") && session) {
    const hasRequests = requests.length > 0;
    return (
      <Card className="animate-fade-in overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-7">
          <p className="inline-flex items-center gap-2.5 text-sm font-medium" role="status" aria-live="polite">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            {hasRequests ? "Someone wants your files" : "Waiting for a receiver"}
          </p>
          <span className="text-sm text-muted tabular-nums">
            {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
          </span>
        </div>

        <div className="grid items-center gap-8 px-5 py-8 sm:grid-cols-[1fr_auto] sm:gap-10 sm:px-7">
          <div className="flex min-w-0 flex-col items-center gap-6 sm:items-start">
            <TransferCodeDisplay code={session.code} joinDeadline={session.joinDeadline} />
            <ShareLinkButton link={session.link} />
          </div>
          <QRCodeCard link={session.link} />
        </div>

        {hasRequests && (
          <div className="flex flex-col gap-3 border-t border-line bg-surface-2/60 p-4 sm:p-5">
            {requests.map((request) => (
              <PendingRequestCard
                key={request.requestId}
                request={request}
                busy={respondingTo === request.requestId}
                disabled={respondingTo !== null}
                onAccept={() => void controller.accept(request.requestId)}
                onReject={() => void controller.reject(request.requestId)}
              />
            ))}
          </div>
        )}
        {error?.code === "notice" && (
          <p className="border-t border-line bg-danger-soft px-5 py-3 text-sm text-danger sm:px-7" role="alert">
            {error.message}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-7">
          <span className="text-xs text-muted">Keep this tab open while sharing</span>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => controller.stopSharing()}>
            <X aria-hidden="true" />
            Stop
          </Button>
        </div>
      </Card>
    );
  }

  const live = LIVE_STATUS[phase];
  if (live) {
    return (
      <Card className="flex flex-col gap-6 p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <ConnectionStatus title={live.title} detail={live.detail} tone={live.tone} route={route} />
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)} className="self-start">
            <X aria-hidden="true" />
            Cancel transfer
          </Button>
        </div>
        {snapshot.activeRequest && (
          <p className="-mt-2 text-sm text-muted">Receiver: {snapshot.activeRequest.deviceLabel}</p>
        )}
        {progress && <TransferProgress progress={progress} verb="delivered" />}
        <ConfirmCancelDialog
          open={confirmOpen}
          title="Cancel this transfer?"
          description="The receiver will stop receiving files and any partially received file will be discarded."
          confirmLabel="Cancel transfer"
          onConfirm={() => controller.cancel()}
          onClose={() => setConfirmOpen(false)}
        />
      </Card>
    );
  }

  if (phase === "completed" && progress) {
    return (
      <CompletionScreen
        title="Files delivered"
        fileCount={progress.files.length}
        totalBytes={progress.totalBytes}
        durationMs={progress.startedAt && progress.finishedAt ? progress.finishedAt - progress.startedAt : null}
        description="The receiver confirmed every file was saved."
        actions={
          <>
            <Link href="/" className={buttonClasses("ghost")}>
              <House aria-hidden="true" />
              Home
            </Link>
            <Button variant="secondary" onClick={() => controller.startOver()}>
              <Plus aria-hidden="true" />
              Send other files
            </Button>
            <Button onClick={shareAgain}>
              <RotateCcw aria-hidden="true" />
              Share again
            </Button>
          </>
        }
      />
    );
  }

  const terminal =
    phase === "expired"
      ? { title: "Session expired", tone: "expired" as const, message: error?.message ?? "No one joined before the code expired." }
      : phase === "cancelled"
        ? { title: "Transfer cancelled", tone: "cancelled" as const, message: error?.message ?? "The transfer was cancelled." }
        : { title: "Transfer failed", tone: "error" as const, message: error?.message ?? "Something went wrong." };

  return (
    <ErrorState
      title={terminal.title}
      message={terminal.message}
      tone={terminal.tone}
      actions={
        <>
          <Button variant="ghost" onClick={() => controller.reset()}>
            Change files
          </Button>
          {files.length > 0 && (
            <Button onClick={shareAgain}>
              <ArrowRight aria-hidden="true" />
              Share again
            </Button>
          )}
        </>
      }
    >
      {progress && progress.transferredBytes > 0 && (
        <p className="text-xs text-muted">
          {formatBytes(progress.transferredBytes)} of {formatBytes(progress.totalBytes)} were delivered before it stopped.
        </p>
      )}
    </ErrorState>
  );
}
