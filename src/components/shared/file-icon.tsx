import { createElement } from "react";
import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  type LucideIcon,
} from "lucide-react";
import { splitExtension } from "@/lib/transfer/file-names";
import { cn } from "@/lib/utils/cn";

const ARCHIVES = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".dmg", ".iso"]);
const CODE = new Set([
  ".js", ".ts", ".tsx", ".jsx", ".json", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".cs", ".html", ".css", ".sh", ".yml", ".yaml", ".xml",
]);
const SHEETS = new Set([".csv", ".xls", ".xlsx", ".ods", ".numbers"]);
const DOCS = new Set([".txt", ".md", ".pdf", ".doc", ".docx", ".rtf", ".odt", ".pages"]);

export function iconForFile(name: string, type: string): LucideIcon {
  const ext = splitExtension(name).ext.toLowerCase();
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideoCamera;
  if (type.startsWith("audio/")) return FileMusic;
  if (ARCHIVES.has(ext) || type.includes("zip") || type.includes("compressed")) return FileArchive;
  if (SHEETS.has(ext)) return FileSpreadsheet;
  if (CODE.has(ext)) return FileCode;
  if (DOCS.has(ext) || type.startsWith("text/")) return FileText;
  return File;
}

export function FileIcon({ name, type, className }: { name: string; type: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-fg-2",
        className,
      )}
      aria-hidden="true"
    >
      {createElement(iconForFile(name, type), { className: "size-[18px]", strokeWidth: 1.75 })}
    </span>
  );
}

/** Short type label such as "PDF" or "PNG". */
export function fileTypeLabel(name: string, type: string): string {
  const ext = splitExtension(name).ext.slice(1);
  if (ext && ext.length <= 6) return ext.toUpperCase();
  if (type) return type.split("/").pop()?.toUpperCase().slice(0, 8) ?? "FILE";
  return "FILE";
}
