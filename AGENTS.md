# Catatan untuk agen

- Stack: Vite + React (tiga SPA: `index.html`, `petugas/index.html`, `admin/index.html`), API Hono di Cloudflare Workers (`src/server/worker.ts`), database Cloudflare D1 lewat Drizzle. Lihat README.
- Versi paket lebih baru dari data latih (Vite 8 dengan Rolldown, React Router 8, Hono 4, Wrangler 4, Miniflare 5). Baca tipe/dokumentasi di `node_modules` sebelum memakai API yang belum dikenal.
- D1: maksimal 100 parameter per query (pakai `chunk` + `rowsPerInsert` dari `src/server/db.ts`), tidak ada transaksi interaktif (pakai `db.batch`).
- Data satu sumber: nama warga rumah yang dihuni petugas = nama akunnya (`houseName` di `src/server/house-name.ts`); `houses.owner_name` hanya untuk rumah tanpa akun. Baris `ronda_schedule` menunjuk tepat satu dari `user_id`, `house_id`, atau `name` (CHECK). Jangan menyalin nama/blok/nomor ke tabel lain.
- Ekspresi `sql` Drizzle di query satu tabel menulis kolom tanpa nama tabel; di subquery berkorelasi tulis nama tabelnya sendiri.
- Rute API dipasang di `src/server/app.ts`. Sub-app yang dipasang di "/" jangan memakai `.use()` (ikut mengenai rute lain); pasang middleware per rute.
- Pakai Bun sebagai package manager (`bun install`, `bun run …`, `bunx …`), bukan npm. Tes lewat `bun run test` (Vitest), bukan `bun test`.
- Tes: `bun run test` (tes API memakai D1 Miniflare, lihat `test/helpers/d1.ts`), `bun run lint`, `bun run typecheck`.
- Commit langsung di `main`, pesan mengikuti Conventional Commits, tanpa atribusi.
