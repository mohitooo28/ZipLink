"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/utils/clipboard";

export function ShareLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    if (await copyText(link)) {
      setCopied(true);
      toast.success("Invitation link copied");
      setTimeout(() => setCopied(false), 1600);
    } else {
      toast.error("Couldn't copy the link. Select it and copy manually.");
    }
  };

  return (
    <div className="flex w-full max-w-sm min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pr-1 pl-4">
      <Link2 className="size-4 shrink-0 text-muted" aria-hidden="true" />
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2 hover:text-fg"
        data-testid="share-link"
      >
        {link.replace(/^https?:\/\//, "")}
      </a>
      {canShare && (
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full px-2.5"
          aria-label="Share invitation link"
          onClick={() => {
            navigator.share({ title: "ZipLink", url: link }).catch(() => undefined);
          }}
        >
          <Share2 aria-hidden="true" />
        </Button>
      )}
      <Button size="sm" variant="secondary" className="rounded-full" onClick={copy} aria-label="Copy invitation link">
        {copied ? <Check aria-hidden="true" /> : null}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
