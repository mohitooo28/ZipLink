"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

/** Files from a drop, skipping folders (which browsers report as pseudo-files). */
function filesFromDrop(event: DragEvent): { files: File[]; skippedFolders: number } {
  const items = Array.from(event.dataTransfer.items ?? []);
  if (items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
    const files: File[] = [];
    let skippedFolders = 0;
    for (const item of items) {
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry();
      if (entry?.isDirectory) {
        skippedFolders += 1;
        continue;
      }
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    return { files, skippedFolders };
  }
  return { files: Array.from(event.dataTransfer.files), skippedFolders: 0 };
}

/** Drag-and-drop handlers for any element that should accept dropped files. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const handlers = {
    onDragEnter: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const { files, skippedFolders } = filesFromDrop(event);
      if (skippedFolders > 0) {
        toast.message("Folders can't be sent directly", {
          description: "Open the folder and select the files inside, or zip it first.",
        });
      }
      if (files.length > 0) onFiles(files);
    },
  };
  return { dragging, handlers };
}
