import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // D1 lokal (Miniflare) butuh beberapa detik saat pertama dinyalakan.
    hookTimeout: 30_000,
  },
});
