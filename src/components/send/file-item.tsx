import { X } from "lucide-react";
import { FileIcon, fileTypeLabel } from "@/components/shared/file-icon";
import { formatBytes } from "@/lib/utils/format-bytes";

interface FileItemProps {
  name: string;
  size: number;
  type: string;
  onRemove?: () => void;
}

export function FileItem({ name, size, type, onRemove }: FileItemProps) {
  return (
    <li className="group/item animate-fade-in flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2">
      <FileIcon name={name} type={type} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
        <span className="text-xs text-muted tabular-nums">
          {fileTypeLabel(name, type)} · {formatBytes(size)}
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-[color,background-color,opacity] hover:bg-surface-3 hover:text-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
