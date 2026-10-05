# Catatan untuk agen

- Stack: Vite + React (tiga SPA: `index.html`, `petugas/index.html`, `admin/index.html`), API Hono sebagai Vercel Function (`src/server/vercel.ts`, dibundel `scripts/build-vercel.ts` ke `.vercel/output`), database Postgres (Supabase; PGlite saat dev dan tes) lewat Drizzle. Lihat README.
- Versi paket lebih baru dari data latih (Vite 8 dengan Rolldown, React Router 8, Hono 4, @hono/node-server 2, PGlite 0.5). Baca tipe/dokumentasi di `node_modules` sebelum memakai API yang belum dikenal.
- Beberapa query yang harus berhasil bersama: `runBatch(db, (tx) => [...])` dari `src/server/db.ts` (satu transaksi). Query harus dibuat dari `tx`, bukan `db`. Supabase lewat Transaction pooler: tanpa prepared statement (`prepare: false`).
- `bun run dev` memakai PGlite di `.data/pglite` yang hanya boleh dibuka satu proses; seed lokal menolak jalan selama dev server hidup. Jangan menyentuh `.data/` atau database Supabase tanpa diminta.
- Data satu sumber: nama warga rumah yang dihuni petugas = nama akunnya (`houseName` di `src/server/house-name.ts`); `houses.owner_name` hanya untuk rumah tanpa akun. Baris `ronda_schedule` menunjuk tepat satu dari `user_id`, `house_id`, atau `name` (CHECK). Jangan menyalin nama/blok/nomor ke tabel lain.
- Ekspresi `sql` Drizzle di query satu tabel menulis kolom tanpa nama tabel; di subquery berkorelasi tulis nama tabelnya sendiri.
- Rute API dipasang di `src/server/app.ts`. Sub-app yang dipasang di "/" jangan memakai `.use()` (ikut mengenai rute lain); pasang middleware per rute.
- Pakai Bun sebagai package manager (`bun install`, `bun run …`, `bunx …`), bukan npm. Tes lewat `bun run test` (Vitest), bukan `bun test`.
- Tes: `bun run test` (tes API memakai PGlite di memori, lihat `test/helpers/db.ts`; `TEST_DATABASE_URL` untuk Postgres sungguhan), `bun run lint`, `bun run typecheck`.
- Commit langsung di `main`, pesan mengikuti Conventional Commits, tanpa atribusi.
