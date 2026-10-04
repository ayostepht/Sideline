import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sideline",
    short_name: "Sideline",
    description: "A self-hosted fantasy football analyzer for Sleeper leagues.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2a2a2a",
    theme_color: "#2a2a2a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
