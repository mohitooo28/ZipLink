"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, FolderCheck, House, Link2, LoaderCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { ConfirmCancelDialog } from "@/components/shared/confirm-cancel-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CompletionScreen } from "@/components/transfer/completion-screen";
import { ConnectionStatus } from "@/components/transfer/connection-status";
import { TransferProgress } from "@/components/transfer/transfer-progress";
import { TransferSummary } from "@/components/transfer/transfer-summary";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useReceiverSession } from "@/hooks/use-receiver-session";
import type { ReceiverPhase } from "@/lib/transfer/transfer-state-machine";
import { isValidSessionCode, normalizeCodeInput } from "@/lib/utils/generate-session-code";
import { DestinationPicker } from "./destination-picker";
import { ReceiverCodeInput } from "./receiver-code-input";
import { SavedFilesList } from "./saved-files-list";

const LIVE_STATUS: Partial<Record<ReceiverPhase, { title: string; detail: string; tone: "busy" | "active" | "warning" }>> = {
  connecting: {
    title: "Establishing peer-to-peer connection",
    detail: "The sender approved your request. Connecting the two devices directly…",
    tone: "busy",
  },
  transferring: { title: "Receiving files", detail: "Keep this tab open until the transfer completes.", tone: "active" },
  finalizing: { title: "Finalizing files", detail: "Closing the last file and confirming with the sender.", tone: "busy" },
  reconnecting: {
    title: "Connection interrupted — reconnecting",
    detail: "The network changed or dropped. Trying to restore the connection…",
    tone: "warning",
  },
};

export function ReceiveFlow() {
  const { controller, snapshot } = useReceiverSession();
  const searchParams = useSearchParams();
  const { phase, error, progress, manifest, route } = snapshot;

  // Invitation details from a QR code or shared link.
  const [initial] = useState(() => ({
    code: normalizeCodeInput(searchParams.get("code") ?? ""),
    token: searchParams.get("token") ?? "",
  }));
  const [code, setCode] = useState(initial.code);
  const invitationToken = isValidSessionCode(initial.code) ? initial.token : "";
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Keep the invitation token out of the address bar, history and screenshots.
  useEffect(() => {
    if (!searchParams.get("token")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [searchParams]);

  const join = (value = code) => {
    if (!isValidSessionCode(value)) return;
    const invitation = value === initial.code ? invitationToken : undefined;
    void controller.join(value, invitation || undefined);
  };

  if (phase === "entering" || phase === "joining") {
    const joining = phase === "joining";
    const invalid = error?.code === "invalid_code";
    const onSubmit = (event: FormEvent) => {
      event.preventDefault();
      join();
    };
    return (
      <Card className="mx-auto flex w-full max-w-md flex-col px-5 pt-10 pb-6 sm:px-8">
        <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Receive files</h1>
            <p className="text-muted" id="code-help">
              Enter the 5-digit code from the sending device.
            </p>
          </div>
          <ReceiverCodeInput
            value={code}
            onChange={(value) => {
              setCode(value);
              controller.dismissError();
            }}
            onComplete={(value) => {
              if (!joining) join(value);
            }}
            disabled={joining}
            invalid={invalid}
            describedBy={invalid ? "code-error" : "code-help"}
          />
          {error && phase === "entering" && (
            <p id="code-error" role="alert" className="-mt-2 text-center text-sm text-danger">
              {error.message}
            </p>
          )}
          {invitationToken && code === initial.code && (
            <p className="-mt-2 inline-flex items-center justify-center gap-1.5 text-xs text-muted">
              <Link2 className="size-3.5" aria-hidden="true" />
              Invitation link detected
            </p>
          )}
          <Button type="submit" size="lg" className="rounded-full" disabled={!isValidSessionCode(code) || joining} data-testid="join">
            {joining ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            {joining ? "Connecting…" : "Join"}
          </Button>
        </form>
      </Card>
    );
  }

  if (phase === "awaiting-approval") {
    return (
      <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-2 p-5 sm:p-8">
        <EmptyState
          pulse
          icon={ShieldCheck}
          title="Waiting for the sender to approve"
          description={
            <>
              Ask the sender to accept your request for code{" "}
              <span className="font-mono font-medium text-fg">{snapshot.code}</span>.
            </>
          }
        />
        <Button variant="ghost" onClick={() => controller.cancel()}>
          <X aria-hidden="true" />
          Cancel request
        </Button>
      </Card>
    );
  }

  if (phase === "reviewing" && manifest) {
    return (
      <Card className="flex flex-col gap-6 p-5 sm:p-8">
        <ConnectionStatus
          title="Connected — choose where to save"
          detail="Review the incoming files. Nothing is received until you continue."
          tone="active"
          route={route}
        />
        <TransferSummary files={manifest.files} totalBytes={manifest.totalBytes} />
        <DestinationPicker
          capabilities={snapshot.capabilities}
          busy={snapshot.choosingTarget}
          notice={snapshot.storageNotice}
          onChoose={(kind) => void controller.chooseDestination(kind)}
          onDecline={() => controller.decline()}
        />
      </Card>
    );
  }

  const live = LIVE_STATUS[phase];
  if (live) {
    return (
      <Card className="flex flex-col gap-6 p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <ConnectionStatus title={live.title} detail={live.detail} tone={live.tone} route={route} />
          {phase !== "connecting" && (
            <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)} className="self-start">
              <X aria-hidden="true" />
              Cancel transfer
            </Button>
          )}
        </div>
        {snapshot.target && (
          <p className="-mt-2 text-sm text-muted">
            Saving to: <span className="text-fg-2">{snapshot.target.label}</span>
          </p>
        )}
        {progress && phase !== "connecting" && <TransferProgress progress={progress} verb="received" />}
        <ConfirmCancelDialog
          open={confirmOpen}
          title="Cancel this transfer?"
          description="The partially received file will be discarded and the sender will be notified."
          confirmLabel="Cancel transfer"
          onConfirm={() => controller.cancel()}
          onClose={() => setConfirmOpen(false)}
        />
      </Card>
    );
  }

  const restart = (
    <Button onClick={() => controller.reset()}>
      <RotateCcw aria-hidden="true" />
      Enter another code
    </Button>
  );
  const home = (
    <Link href="/" className={buttonClasses("ghost")}>
      <House aria-hidden="true" />
      Home
    </Link>
  );

  if (phase === "completed" && progress) {
    const inFolder = snapshot.target?.kind === "directory";
    return (
      <CompletionScreen
        title="All files received"
        fileCount={progress.files.length}
        totalBytes={progress.totalBytes}
        durationMs={progress.startedAt && progress.finishedAt ? progress.finishedAt - progress.startedAt : null}
        description={
          inFolder ? (
            <span className="inline-flex items-center gap-1.5">
              <FolderCheck className="size-4 text-success" aria-hidden="true" />
              Saved to “{snapshot.target?.label}”.
            </span>
          ) : (
            "Every file was received and verified. Save them below."
          )
        }
        actions={
          <>
            {home}
            {restart}
          </>
        }
      >
        {!inFolder && <SavedFilesList files={snapshot.savedFiles} />}
      </CompletionScreen>
    );
  }

  const terminal =
    phase === "rejected"
      ? { title: "Request declined", tone: "cancelled" as const }
      : phase === "expired"
        ? { title: "Session unavailable", tone: "expired" as const }
        : phase === "cancelled"
          ? { title: "Transfer cancelled", tone: "cancelled" as const }
          : { title: "Transfer failed", tone: "error" as const };

  return (
    <ErrorState
      title={terminal.title}
      message={error?.message ?? (phase === "cancelled" ? "The transfer was cancelled." : "Something went wrong.")}
      tone={terminal.tone}
      actions={
        <>
          {home}
          {restart}
        </>
      }
    >
      {snapshot.target?.kind === "directory" && snapshot.savedFiles.length > 0 && (
        <p className="text-xs text-muted">
          {snapshot.savedFiles.length} completed {snapshot.savedFiles.length === 1 ? "file was" : "files were"} kept in “
          {snapshot.target.label}”. Incomplete files were removed.
        </p>
      )}
    </ErrorState>
  );
}
