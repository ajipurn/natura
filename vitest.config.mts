import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` sengaja melempar error di luar server React; di tes tidak perlu.
      "server-only": path.resolve(import.meta.dirname, "test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    env: { DATABASE_URL: "pglite:memory", NEXT_PUBLIC_TIMEZONE: "Asia/Jakarta" },
  },
});
