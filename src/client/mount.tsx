import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import type { createBrowserRouter } from "react-router";
import { queryClient } from "./query";
import { setupScrollbars } from "./scrollbars";
import "@/styles.css";

/** Pasang app (router + cache data) ke #root. */
export function mount(router: ReturnType<typeof createBrowserRouter>) {
  setupScrollbars();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
