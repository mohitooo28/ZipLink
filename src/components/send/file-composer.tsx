"use client";

import { ArrowRight, FileText, Image as ImageIcon, LoaderCircle, Plus, Trash, Upload } from "lucide-react";
import type { SelectedFile } from "@/lib/session/sender-controller";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format-bytes";
import { useFileDrop } from "./file-dropzone";
import { FileItem } from "./file-item";
import { FilePickerButton } from "./file-picker-button";

interface FileComposerProps {
  files: SelectedFile[];
  totalBytes: number;
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onStart: () => void;
}

/** Three fanned "file cards" that spread apart on hover or while dragging. */
function FileStack({ active }: { active: boolean }) {
  const card =
    "absolute grid h-[4.5rem] w-14 place-items-center rounded-xl transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]";
  const side = "border border-line bg-surface-2 text-muted shadow-[var(--shadow-card)]";
  return (
    <div className="relative h-24 w-40" aria-hidden="true">
      <span
        className={cn(card, side, "top-3 left-7", active ? "-translate-x-5 -rotate-[18deg]" : "-rotate-[10deg]", "group-hover:-translate-x-5 group-hover:-rotate-[18deg]")}
      >
        <FileText className="size-5" />
      </span>
      <span
        className={cn(card, side, "top-3 right-7", active ? "translate-x-5 rotate-[18deg]" : "rotate-[10deg]", "group-hover:translate-x-5 group-hover:rotate-[18deg]")}
      >
        <ImageIcon className="size-5" />
      </span>
      <span
        className={cn(
          card,
          "top-0 left-1/2 -ml-7 bg-accent text-accent-fg",
          active ? "-translate-y-2 scale-105" : "",
          "group-hover:-translate-y-2",
        )}
      >
        <Upload className="size-5" />
      </span>
    </div>
  );
}

export function FileComposer({ files, totalBytes, busy, onAdd, onRemove, onClear, onStart }: FileComposerProps) {
  const { dragging, handlers } = useFileDrop(busy ? () => undefined : onAdd);
  const empty = files.length === 0;

  return (
    <section
      {...handlers}
      aria-label="Files to send"
      data-dragging={dragging || undefined}
      className={cn(
        "group relative overflow-hidden rounded-3xl border bg-surface shadow-[var(--shadow-lift)] transition-[border-color,box-shadow] duration-300",
        dragging ? "border-accent" : "border-line",
      )}
    >
      {/* Soft accent wash that brightens while dragging. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft),transparent)] transition-opacity duration-300",
          dragging ? "opacity-100" : "opacity-60",
        )}
      />

      {empty ? (
        <div className="relative flex flex-col items-center gap-7 px-6 pt-14 pb-12 text-center sm:pt-16">
          <FileStack active={dragging} />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{dragging ? "Drop to add" : "Send files"}</h1>
            <p className="text-muted">Drop files anywhere here, or pick them from your device.</p>
          </div>
          <FilePickerButton onFiles={onAdd} variant="primary" size="lg" className="rounded-full px-7">
            <Plus aria-hidden="true" />
            Choose files
          </FilePickerButton>
          <p className="text-xs text-muted">Any type · any size · nothing is uploaded</p>
        </div>
      ) : (
        <div className="relative flex flex-col">
          <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">Ready to send</h1>
              <p className="text-sm text-muted tabular-nums" data-testid="selection-summary">
                {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
              </p>
            </div>
            {!busy && (
              <div className="flex items-center gap-1">
                <FilePickerButton onFiles={onAdd} variant="secondary" size="sm" className="rounded-full">
                  <Plus aria-hidden="true" />
                  Add
                </FilePickerButton>
                <Button variant="ghost" size="sm" className="rounded-full px-2.5" onClick={onClear} aria-label="Remove all files">
                  <Trash aria-hidden="true" />
                </Button>
              </div>
            )}
          </header>

          <ul className="max-h-[min(50vh,26rem)] overflow-y-auto px-2 pb-2 sm:px-3">
            {files.map(({ id, file }) => (
              <FileItem
                key={id}
                name={file.name}
                size={file.size}
                type={file.type}
                onRemove={busy ? undefined : () => onRemove(id)}
              />
            ))}
          </ul>

          <div className="border-t border-line p-4 sm:p-5">
            <Button size="lg" onClick={onStart} disabled={busy} data-testid="start-sharing" className="w-full rounded-full">
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {busy ? "Creating a code…" : "Get a sharing code"}
              {!busy && <ArrowRight aria-hidden="true" />}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
