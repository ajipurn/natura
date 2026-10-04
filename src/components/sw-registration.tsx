"use client";

import { useEffect } from "react";

/** Service worker hanya di production supaya tidak mengganggu hot reload saat development. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.warn("Service worker gagal didaftarkan", err));
  }, []);
  return null;
}
