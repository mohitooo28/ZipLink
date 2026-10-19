import { cn } from "@/lib/utils/cn";

/** ZipLink mark: two linked chevrons forming a "Z" path between two nodes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path
        d="M10 10.5h11.5L10.5 21.5H22"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10.5" r="1.9" fill="white" />
      <circle cx="22" cy="21.5" r="1.9" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">ZipLink</span>
    </span>
  );
}
