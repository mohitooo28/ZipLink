import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  pulse?: boolean;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, pulse, className, children }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-4 py-8 text-center", className)}>
      <span className="relative grid size-14 place-items-center">
        {pulse && (
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent/25" aria-hidden="true" />
        )}
        <span className="relative grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
