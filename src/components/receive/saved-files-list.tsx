"use client";

import { Download } from "lucide-react";
import type { SavedFile } from "@/types/transfer";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils/format-bytes";

function triggerDownload(file: SavedFile) {
  if (!file.url) return;
  const anchor = document.createElement("a");
  anchor.href = file.url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Download links for files held in browser storage or memory. */
export function SavedFilesList({ files }: { files: SavedFile[] }) {
  const downloadable = files.filter((file) => file.url);
  if (downloadable.length === 0) return null;

  const saveAll = async () => {
    for (const file of downloadable) {
      triggerDownload(file);
      // Browsers may drop downloads triggered in the same tick.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  };

  return (
    <section aria-label="Received files" className="w-full max-w-lg overflow-hidden rounded-xl border border-line text-left">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="text-sm font-medium">Save to your device</span>
        {downloadable.length > 1 && (
          <Button size="sm" onClick={saveAll}>
            <Download aria-hidden="true" />
            Save all
          </Button>
        )}
      </header>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {downloadable.map((file) => (
          <li key={file.index} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm" title={file.name}>
                {file.name}
              </span>
              <span className="text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
            </span>
            <a
              href={file.url}
              download={file.name}
              className={buttonClasses("secondary", "sm")}
              data-testid="download-link"
              aria-label={`Save ${file.name}`}
            >
              <Download aria-hidden="true" />
              Save
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
