import { CircleAlert, CircleCheck } from "lucide-react";
import type { FileProgress } from "@/types/transfer";
import { FileIcon } from "@/components/shared/file-icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format-bytes";

export function FileTransferRow({ file }: { file: FileProgress }) {
  const percent = file.size > 0 ? Math.floor((file.transferred / file.size) * 100) : file.status === "done" ? 100 : 0;
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4" data-status={file.status}>
      <FileIcon name={file.name} type={file.type} className={cn(file.status === "pending" && "opacity-60")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("truncate text-sm font-medium", file.status === "pending" && "text-muted")} title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {file.status === "done"
              ? formatBytes(file.size)
              : file.status === "failed"
                ? "Failed"
                : file.status === "pending"
                  ? `Waiting · ${formatBytes(file.size)}`
                  : `${percent}% of ${formatBytes(file.size)}`}
          </span>
        </div>
        <ProgressBar
          value={file.transferred}
          max={file.size}
          size="sm"
          label={`${file.name} progress`}
          tone={file.status === "done" ? "success" : file.status === "failed" ? "danger" : "accent"}
        />
      </div>
      <span className="grid size-5 shrink-0 place-items-center" aria-hidden="true">
        {file.status === "done" && <CircleCheck className="size-5 text-success" />}
        {file.status === "failed" && <CircleAlert className="size-5 text-danger" />}
      </span>
    </li>
  );
}
