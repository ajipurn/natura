import { mount } from "@/client/mount";
import { router } from "./routes";

mount(router, "petugas");

// Service worker hanya di build production supaya tidak mengganggu hot reload saat development.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((err) => console.warn("Service worker gagal didaftarkan", err));
}
