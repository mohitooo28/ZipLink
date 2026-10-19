"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmCancelDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Accessible confirmation built on the native <dialog> element. */
export function ConfirmCancelDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmCancelDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-fg shadow-[var(--shadow-lift)]"
    >
      <div className="flex flex-col gap-5 p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-danger-soft text-danger">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <p id="confirm-description" className="text-sm leading-relaxed text-muted">
            {description}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} autoFocus>
            Keep going
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
