import { mount } from "@/client/mount";
import { router } from "./routes";
import { appSurface } from "@/lib/app-paths";

mount(router, "petugas");

// Service worker hanya di build production supaya tidak mengganggu hot reload saat development.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((err) => console.warn("Service worker gagal didaftarkan", err));
}

if (import.meta.env.PROD && appSurface(location.hostname) === "petugas") {
  document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href = "/petugas-domain.webmanifest";
}
