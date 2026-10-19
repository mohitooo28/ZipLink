import type { Metadata } from "next";
import { Suspense } from "react";
import { ReceiveFlow } from "@/components/receive/receive-flow";
import { SwitchModeLink } from "@/components/shared/switch-mode-link";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Receive files",
  description: "Enter a ZipLink code to receive files directly from another device.",
  // Invitation links carry a session token; keep them out of referrers.
  referrer: "no-referrer",
};

function ReceiveFallback() {
  return <Card className="mx-auto h-[22rem] w-full max-w-md animate-pulse rounded-3xl" aria-hidden="true" />;
}

export default function ReceivePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 pt-24 pb-12">
      {/* useSearchParams (invitation links) requires a Suspense boundary when prerendering. */}
      <Suspense fallback={<ReceiveFallback />}>
        <ReceiveFlow />
      </Suspense>
      <SwitchModeLink href="/send" prompt="Want to share instead?" action="Send files" />
    </div>
  );
}
