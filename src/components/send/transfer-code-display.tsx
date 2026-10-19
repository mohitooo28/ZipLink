"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/utils/clipboard";
import { formatCountdown } from "@/lib/utils/format-duration";
import { useNow } from "@/hooks/use-now";

interface TransferCodeDisplayProps {
  code: string;
  joinDeadline: number;
}

export function TransferCodeDisplay({ code, joinDeadline }: TransferCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const now = useNow(1000);

  return (
    <div className="flex flex-col items-center gap-3 sm:items-start">
      <p className="text-sm font-medium text-muted" id="code-label">
        Your code
      </p>
      <button
        type="button"
        aria-labelledby="code-label"
        aria-describedby="code-hint"
        data-testid="share-code"
        data-code={code}
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }
        }}
        className="group -mx-1 flex items-center gap-1.5 rounded-2xl p-1 sm:gap-2"
      >
        {code.split("").map((digit, index) => (
          <span
            key={index}
            className="rise grid h-16 w-12 place-items-center rounded-2xl bg-surface-2 font-mono text-4xl font-semibold tabular-nums ring-1 ring-line transition-[box-shadow,transform] group-hover:ring-accent-line sm:h-[4.5rem] sm:w-14 sm:text-[2.6rem]"
            style={{ ["--i" as string]: index }}
          >
            {digit}
          </span>
        ))}
        <span className="sr-only">{code.split("").join(" ")}</span>
      </button>
      <p id="code-hint" className="inline-flex items-center gap-1.5 text-xs text-muted tabular-nums" aria-live="polite">
        {copied ? (
          <>
            <Check className="size-3.5 text-success" aria-hidden="true" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" aria-hidden="true" /> Tap to copy · expires in {formatCountdown(joinDeadline - now)}
          </>
        )}
      </p>
    </div>
  );
}
