# Catatan untuk agen

- Stack: Vite + React (tiga SPA: `index.html`, `petugas/index.html`, `admin/index.html`), API Hono di Cloudflare Workers (`src/server/worker.ts`), database Cloudflare D1 lewat Drizzle. Lihat README.
- Versi paket lebih baru dari data latih (Vite 8 dengan Rolldown, React Router 8, Hono 4, Wrangler 4, Miniflare 5). Baca tipe/dokumentasi di `node_modules` sebelum memakai API yang belum dikenal.
- D1: maksimal 100 parameter per query (pakai `chunk` + `rowsPerInsert` dari `src/server/db.ts`), tidak ada transaksi interaktif (pakai `db.batch`).
- Rute API dipasang di `src/server/app.ts`. Sub-app yang dipasang di "/" jangan memakai `.use()` (ikut mengenai rute lain); pasang middleware per rute.
- Pakai Bun sebagai package manager (`bun install`, `bun run …`, `bunx …`), bukan npm. Tes lewat `bun run test` (Vitest), bukan `bun test`.
- Tes: `bun run test` (tes API memakai D1 Miniflare, lihat `test/helpers/d1.ts`), `bun run lint`, `bun run typecheck`.
- Commit langsung di `main`, pesan mengikuti Conventional Commits, tanpa atribusi.
