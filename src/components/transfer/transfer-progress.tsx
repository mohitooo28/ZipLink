import type { TransferProgressSnapshot } from "@/types/transfer";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatBytes, formatSpeed } from "@/lib/utils/format-bytes";
import { formatDuration } from "@/lib/utils/format-duration";
import { FileTransferRow } from "./file-transfer-row";

interface TransferProgressProps {
  progress: TransferProgressSnapshot;
  /** "sent" for the sender (bytes confirmed written on the receiver), "received" otherwise. */
  verb: "delivered" | "received";
}

export function fileCounts(progress: TransferProgressSnapshot) {
  let done = 0;
  let failed = 0;
  for (const file of progress.files) {
    if (file.status === "done") done += 1;
    else if (file.status === "failed") failed += 1;
  }
  return { done, failed, pending: progress.files.length - done - failed };
}

export function TransferProgress({ progress, verb }: TransferProgressProps) {
  const { totalBytes, transferredBytes } = progress;
  const percent = totalBytes > 0 ? Math.floor((transferredBytes / totalBytes) * 100) : 0;
  const counts = fileCounts(progress);
  const current = progress.currentIndex !== null ? progress.files[progress.currentIndex] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-4xl font-semibold tracking-tight tabular-nums" data-testid="overall-percent">
              {percent}%
            </p>
            <p className="truncate text-sm text-muted">
              {current ? (
                <>
                  Current: <span className="text-fg-2">{current.name}</span>
                </>
              ) : (
                " "
              )}
            </p>
          </div>
          <p className="shrink-0 text-right text-sm tabular-nums text-muted">
            <span className="text-fg">{formatBytes(transferredBytes)}</span> / {formatBytes(totalBytes)}
            <br />
            {verb}
          </p>
        </div>
        <ProgressBar value={transferredBytes} max={totalBytes} label="Overall transfer progress" />
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm sm:grid-cols-4">
        {[
          ["Speed", formatSpeed(progress.bytesPerSecond)],
          ["Time left", formatDuration(progress.etaSeconds)],
          ["Completed", `${counts.done} of ${progress.files.length}`],
          ["Pending · failed", `${counts.pending} · ${counts.failed}`],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="max-h-[24rem] divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Files">
        {progress.files.map((file) => (
          <FileTransferRow key={file.index} file={file} />
        ))}
      </ul>
    </div>
  );
}
