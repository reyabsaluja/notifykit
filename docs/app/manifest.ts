import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NotifyKit — App-native notifications for TypeScript",
    short_name: "NotifyKit",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
