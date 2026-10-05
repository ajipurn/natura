import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // PGlite (Postgres di memori) butuh beberapa detik untuk dinyalakan dan dimigrasi.
    hookTimeout: 30_000,
  },
});
