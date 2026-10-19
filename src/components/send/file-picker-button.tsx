"use client";

import { useRef, type ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

interface FilePickerButtonProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Opens the native file picker (multiple selection). */
export function FilePickerButton({ onFiles, children, variant = "secondary", size = "md", className }: FilePickerButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset so picking the same file again still fires a change event.
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button variant={variant} size={size} className={className} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  );
}
