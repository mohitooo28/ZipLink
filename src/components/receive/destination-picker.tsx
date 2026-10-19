"use client";

import { FolderDown, HardDriveDownload, LoaderCircle, MemoryStick, TriangleAlert, X } from "lucide-react";
import type { SaveTargetKind } from "@/types/transfer";
import { Button } from "@/components/ui/button";
import type { SaveCapabilities } from "@/lib/transfer/file-writer";

interface DestinationPickerProps {
  capabilities: SaveCapabilities;
  busy: boolean;
  notice: string | null;
  onChoose: (kind: SaveTargetKind) => void;
  onDecline: () => void;
}

/** Lets the receiver pick where incoming files are written before any data flows. */
export function DestinationPicker({ capabilities, busy, notice, onChoose, onDecline }: DestinationPickerProps) {
  const fallbackKind: SaveTargetKind = capabilities.browserStorage ? "browser-storage" : "memory";

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p className="flex gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-fg-2" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        {capabilities.directory ? (
          <>
            <Button size="lg" className="sm:flex-1" onClick={() => onChoose("directory")} disabled={busy} data-testid="choose-folder">
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FolderDown aria-hidden="true" />}
              Choose folder &amp; receive
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="sm:flex-1"
              onClick={() => onChoose(fallbackKind)}
              disabled={busy}
              data-testid="receive-in-browser"
            >
              <HardDriveDownload aria-hidden="true" />
              Receive, download after
            </Button>
          </>
        ) : (
          <Button size="lg" className="sm:flex-1" onClick={() => onChoose(fallbackKind)} disabled={busy} data-testid="receive-in-browser">
            {busy ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : fallbackKind === "memory" ? (
              <MemoryStick aria-hidden="true" />
            ) : (
              <HardDriveDownload aria-hidden="true" />
            )}
            Accept &amp; receive
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onDecline} disabled={busy}>
          <X aria-hidden="true" />
          Decline
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {capabilities.directory
          ? "Choosing a folder streams each file straight to disk — best for large transfers. Existing files are never overwritten."
          : capabilities.browserStorage
            ? "Files are streamed into this browser's private storage, then you save them with one tap."
            : "This browser keeps received files in memory until you save them."}
      </p>
    </div>
  );
}
