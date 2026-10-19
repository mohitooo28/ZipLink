/** Public site details used for metadata, sitemap and structured data. */
export const SITE = {
  name: "ZipLink",
  title: "ZipLink — Share files directly between devices",
  description:
    "Free peer-to-peer file sharing in your browser. Send files of any type and size straight to another device with a 5-digit code. No uploads, no account.",
  keywords: [
    "file sharing",
    "peer-to-peer file transfer",
    "P2P file sharing",
    "send large files",
    "WebRTC file transfer",
    "share files between devices",
    "no upload file sharing",
    "AirDrop alternative",
  ],
} as const;

/** Absolute origin of the deployment; set NEXT_PUBLIC_SITE_URL in production. */
export function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}
