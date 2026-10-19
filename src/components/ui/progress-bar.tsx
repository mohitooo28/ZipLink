import { cn } from "@/lib/utils/cn";

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "success" | "danger";
  size?: "sm" | "md";
  className?: string;
}

const TONES = { accent: "bg-accent", success: "bg-success", danger: "bg-danger" } as const;

export function ProgressBar({ value, max, label, tone = "accent", size = "md", className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : value > 0 ? 1 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn("w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2.5", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", TONES[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
