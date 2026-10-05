import { defineConfig } from "drizzle-kit";

// Migrasi dibuat dengan `bun run db:generate`, lalu dijalankan `bun run db:migrate:remote` (lihat README).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/schema.ts",
  out: "./drizzle",
});
