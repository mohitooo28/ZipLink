import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils/format-bytes";
import { formatDuration } from "@/lib/utils/format-duration";

interface CompletionScreenProps {
  title: string;
  fileCount: number;
  totalBytes: number;
  durationMs: number | null;
  description?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}

export function CompletionScreen({
  title,
  fileCount,
  totalBytes,
  durationMs,
  description,
  actions,
  children,
}: CompletionScreenProps) {
  return (
    <Card className="animate-fade-in flex flex-col items-center gap-6 px-5 py-10 text-center sm:px-10" data-testid="completion">
      <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success">
        <CircleCheck className="size-8" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2" role="status">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">
          {fileCount} {fileCount === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
          {durationMs !== null && durationMs > 0 && <> · {formatDuration(durationMs / 1000)}</>}
        </p>
        {description && <div className="text-sm text-muted">{description}</div>}
      </div>
      {children}
      <div className="flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row">{actions}</div>
    </Card>
  );
}
