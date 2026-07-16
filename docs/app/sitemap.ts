import type { MetadataRoute } from "next";
import { DOCS_PAGES, SITE_URL } from "../lib/site";

function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const docs: MetadataRoute.Sitemap = Object.values(DOCS_PAGES).map(
    ({ path }) => ({
      url: absoluteUrl(path),
      changeFrequency: "monthly",
      priority: path === "/docs" ? 0.9 : 0.7,
    }),
  );

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...docs,
    {
      url: absoluteUrl("/demo"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
