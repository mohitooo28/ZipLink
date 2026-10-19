import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Quiet link to the opposite flow (send ↔ receive). */
export function SwitchModeLink({ href, prompt, action }: { href: "/send" | "/receive"; prompt: string; action: string }) {
  return (
    <p className="text-center text-sm text-muted">
      {prompt}{" "}
      <Link
        href={href}
        className="group inline-flex items-center gap-1 rounded font-medium text-fg underline-offset-4 hover:underline"
      >
        {action}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </p>
  );
}
