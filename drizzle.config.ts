import { defineConfig } from "drizzle-kit";

// Migrasi dibuat dengan `npm run db:generate`, lalu dijalankan wrangler (lihat README).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/schema.ts",
  out: "./drizzle",
});
