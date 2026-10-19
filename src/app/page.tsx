import Link from "next/link";
import { ArrowRight, Laptop, Smartphone } from "lucide-react";
import { ServiceStatus } from "@/components/shared/service-status";
import { buttonClasses } from "@/components/ui/button";

const FILE_TYPES = [".pdf", ".jpg", ".zip", ".mp4", ".psd", ".docx", ".mov", ".png", ".fig", ".mp3", ".key", ".raw", ".csv", ".apk"];

export default function Home() {
  return (
    <section className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* Ambient motion */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="rings absolute inset-0">
          <span />
          <span />
          <span />
        </div>
        <div className="orbit size-[30rem] sm:size-[40rem]">
          <i />
          <i />
        </div>
        <div className="orbit orbit-reverse size-[44rem] opacity-60 sm:size-[58rem]">
          <i />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-4 pt-28 pb-16 text-center">
        <div className="rise" style={{ ["--i" as string]: 0 }}>
          <ServiceStatus />
        </div>

        <div className="flex flex-col gap-5">
          <h1
            className="rise text-5xl leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-7xl"
            style={{ ["--i" as string]: 1 }}
          >
            Your files. Your devices. <span className="draw-underline">Directly.</span>
          </h1>
          <p className="rise mx-auto max-w-sm text-pretty text-muted sm:text-lg" style={{ ["--i" as string]: 2 }}>
            Share any file between devices. No uploads, no account.
          </p>
        </div>

        <div className="rise flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row" style={{ ["--i" as string]: 3 }}>
          <Link href="/send" className={buttonClasses("primary", "lg", "group rounded-full px-8")}>
            Send files
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link href="/receive" className={buttonClasses("secondary", "lg", "rounded-full px-8")}>
            Receive files
          </Link>
        </div>

        <div className="rise mt-4 flex w-full max-w-xs items-center gap-4" style={{ ["--i" as string]: 4 }} aria-hidden="true">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-bg text-fg">
            <Laptop className="size-[18px]" strokeWidth={1.5} />
          </span>
          <div className="beam flex-1">
            <span />
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-bg text-fg">
            <Smartphone className="size-[18px]" strokeWidth={1.5} />
          </span>
        </div>
      </div>

      <div className="rise marquee w-full overflow-hidden pb-8" style={{ ["--i" as string]: 5 }} aria-hidden="true">
        <div className="marquee-track font-mono text-sm text-muted">
          {[...FILE_TYPES, ...FILE_TYPES].map((type, index) => (
            <span key={index} className="shrink-0 pr-10">
              {type}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
