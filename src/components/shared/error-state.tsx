import type { ReactNode } from "react";
import { CircleAlert, CircleX, Clock, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type Tone = "error" | "cancelled" | "expired";

const TONES: Record<Tone, { icon: LucideIcon; ring: string }> = {
  error: { icon: CircleAlert, ring: "bg-danger-soft text-danger" },
  cancelled: { icon: CircleX, ring: "bg-surface-2 text-fg-2" },
  expired: { icon: Clock, ring: "bg-warning-soft text-warning" },
};

interface ErrorStateProps {
  title: string;
  message?: string | null;
  tone?: Tone;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ErrorState({ title, message, tone = "error", actions, children }: ErrorStateProps) {
  const { icon: Icon, ring } = TONES[tone];
  return (
    <Card
      className="animate-fade-in flex flex-col items-center gap-5 px-5 py-10 text-center sm:px-10"
      role={tone === "error" ? "alert" : "status"}
    >
      <span className={cn("grid size-14 place-items-center rounded-2xl", ring)}>
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {message && <p className="text-sm leading-relaxed text-muted">{message}</p>}
      </div>
      {children}
      {actions && (
        <div className="flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row">{actions}</div>
      )}
    </Card>
  );
}
