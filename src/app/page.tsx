import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Laptop, Smartphone } from "lucide-react";
import { ServiceStatus } from "@/components/shared/service-status";
import { buttonClasses } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="relative isolate flex flex-1 items-center overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="dot-grid absolute inset-0" />
        <div className="aurora aurora-a top-[-10%] left-1/2 size-[34rem] -translate-x-1/2" />
        <div className="aurora aurora-b top-[10%] left-[55%] size-[26rem]" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-10 px-4 py-20 text-center sm:py-28">
        <div className="rise" style={{ ["--i" as string]: 0 }}>
          <ServiceStatus />
        </div>

        <div className="flex flex-col gap-5">
          <h1
            className="rise text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-7xl"
            style={{ ["--i" as string]: 1 }}
          >
            Your files. Your devices. <span className="text-shimmer">Directly.</span>
          </h1>
          <p
            className="rise mx-auto max-w-md text-base text-pretty text-muted sm:text-lg"
            style={{ ["--i" as string]: 2 }}
          >
            Share files of any type, directly between devices. No file uploads. No account required.
          </p>
        </div>

        <div
          className="rise flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row"
          style={{ ["--i" as string]: 3 }}
        >
          <Link href="/send" className={buttonClasses("primary", "lg", "rounded-full px-7")}>
            <ArrowUpFromLine aria-hidden="true" />
            Send files
          </Link>
          <Link href="/receive" className={buttonClasses("secondary", "lg", "rounded-full px-7")}>
            <ArrowDownToLine aria-hidden="true" />
            Receive files
          </Link>
        </div>

        <div
          className="rise mt-6 flex w-full max-w-sm items-center gap-4"
          style={{ ["--i" as string]: 4 }}
          aria-hidden="true"
        >
          <span className="node-glow grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-fg-2">
            <Laptop className="size-5" />
          </span>
          <div className="beam flex-1">
            <span />
          </div>
          <span className="node-glow grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-fg-2">
            <Smartphone className="size-5" />
          </span>
        </div>
        <p className="rise -mt-6 text-xs text-muted" style={{ ["--i" as string]: 5 }}>
          Peer-to-peer · encrypted · never stored
        </p>
      </div>
    </section>
  );
}
