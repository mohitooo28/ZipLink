import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export function AppHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 px-5 py-5 sm:px-8 sm:py-6">
      <Link href="/" className="inline-flex rounded-lg" aria-label="ZipLink home">
        <Logo />
      </Link>
    </header>
  );
}
