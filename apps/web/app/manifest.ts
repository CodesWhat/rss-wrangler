import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RSS Wrangler",
    short_name: "Wrangler",
    description: "Self-hosted RSS reader with deduped story cards and digest mode.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
