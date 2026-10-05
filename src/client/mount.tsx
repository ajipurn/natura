import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import type { createBrowserRouter } from "react-router";
import { persistOptions, queryClient, refreshRestored, type AppName } from "./query";
import { setupScrollbars } from "./scrollbars";
import "@/styles.css";

/** Pasang app (router + cache data yang juga disimpan di HP) ke #root. */
export function mount(router: ReturnType<typeof createBrowserRouter>, app: AppName) {
  setupScrollbars();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions(app)} onSuccess={refreshRestored}>
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </StrictMode>,
  );
}
