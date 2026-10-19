import type { ManifestFile } from "@/types/transfer";
import { FileIcon, fileTypeLabel } from "@/components/shared/file-icon";
import { formatBytes } from "@/lib/utils/format-bytes";

interface TransferSummaryProps {
  files: Pick<ManifestFile, "index" | "name" | "size" | "type">[];
  totalBytes: number;
}

/** Read-only list of the files in a transfer, with totals. */
export function TransferSummary({ files, totalBytes }: TransferSummaryProps) {
  return (
    <section aria-label="Files in this transfer" className="overflow-hidden rounded-xl border border-line">
      <header className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5 text-sm">
        <span className="font-medium">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span className="tabular-nums text-muted">{formatBytes(totalBytes)}</span>
      </header>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {files.map((file) => (
          <li key={file.index} className="flex items-center gap-3 px-4 py-2.5">
            <FileIcon name={file.name} type={file.type} className="size-9" />
            <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {fileTypeLabel(file.name, file.type)} · {formatBytes(file.size)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
