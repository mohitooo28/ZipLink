import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "monthly", priority: 1 },
    { url: new URL("/send", base).toString(), changeFrequency: "monthly", priority: 0.8 },
    { url: new URL("/receive", base).toString(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
