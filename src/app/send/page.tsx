import type { Metadata } from "next";
import { SendFlow } from "@/components/send/send-flow";
import { SwitchModeLink } from "@/components/shared/switch-mode-link";

export const metadata: Metadata = {
  title: "Send files",
  description: "Choose files and share them directly with another device.",
};

export default function SendPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 pt-24 pb-12">
      <SendFlow />
      <SwitchModeLink href="/receive" prompt="Have a code?" action="Receive files" />
    </div>
  );
}
