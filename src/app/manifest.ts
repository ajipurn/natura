import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jimpitan",
    short_name: "Jimpitan",
    description: "Catat jimpitan ronda dengan scan QR per rumah.",
    start_url: "/ronda",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#0f766e",
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
