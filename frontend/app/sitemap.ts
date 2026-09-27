import type { MetadataRoute } from "next";

const BASE = "https://hustlrzz.vercel.app";

/** Public, indexable routes only. Everything else is sign-in gated. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/legal/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
