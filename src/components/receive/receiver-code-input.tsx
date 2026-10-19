"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { normalizeCodeInput, SESSION_CODE_LENGTH } from "@/lib/utils/generate-session-code";
import { cn } from "@/lib/utils/cn";

interface ReceiverCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Five single-digit boxes that behave like one field: typing advances,
 * Backspace goes back, arrows move, and pasting fills every box.
 */
export function ReceiverCodeInput({ value, onChange, onComplete, disabled, invalid, describedBy }: ReceiverCodeInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: SESSION_CODE_LENGTH }, (_, i) => value[i] ?? "");

  const focus = (index: number) => {
    const target = inputs.current[Math.max(0, Math.min(SESSION_CODE_LENGTH - 1, index))];
    target?.focus();
    target?.select();
  };

  const commit = (next: string, focusIndex: number) => {
    const normalized = normalizeCodeInput(next);
    onChange(normalized);
    focus(focusIndex);
    if (normalized.length === SESSION_CODE_LENGTH) onComplete?.(normalized);
  };

  const handleInput = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or a paste that bypassed onPaste: spread from this box.
      commit(value.slice(0, index) + typed, index + typed.length);
      return;
    }
    const chars = digits.slice();
    chars[index] = typed;
    commit(chars.join(""), index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      // The value has no gaps, so deleting removes one character and shifts the rest left.
      const removeAt = digits[index] ? index : index - 1;
      if (removeAt < 0) return;
      onChange(value.slice(0, removeAt) + value.slice(removeAt + 1));
      focus(removeAt);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    } else if (event.key === "Enter" && value.length === SESSION_CODE_LENGTH) {
      onComplete?.(value);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = normalizeCodeInput(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    commit(pasted, pasted.length);
  };

  return (
    <div role="group" aria-label="5-digit sharing code" aria-describedby={describedBy} className="flex justify-center gap-2 sm:gap-2.5">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          value={digit}
          onChange={(event) => handleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={SESSION_CODE_LENGTH}
          aria-label={`Digit ${index + 1} of ${SESSION_CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          data-testid={`code-digit-${index}`}
          className={cn(
            "h-16 w-12 rounded-xl border bg-surface text-center font-mono text-3xl font-semibold tabular-nums shadow-[var(--shadow-card)] transition-[border-color,box-shadow] outline-none sm:h-18 sm:w-14",
            "focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-60",
            invalid ? "border-danger" : "border-line-strong",
          )}
        />
      ))}
    </div>
  );
}
