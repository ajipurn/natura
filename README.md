# Jimpitan

Aplikasi jimpitan ronda Cluster Natura. Setiap rumah punya stiker QR di dekat wadah jimpitan. Petugas ronda scan QR-nya, tekan **Ada** atau **Kosong**, dan rekapnya langsung tersusun.

Satu aplikasi, tiga bagian:

| Alamat | Untuk | Isi |
| --- | --- | --- |
| `/petugas/` | Petugas ronda (HP) | Scan QR, catat manual, denah 2D/3D, jaga malam ini, riwayat, jadwal. Tetap jalan tanpa sinyal. |
| `/admin/` | Pengurus (laptop/HP) | Dashboard ringkasan, data rumah & cetak QR, petugas, jadwal, rekap bulanan, riwayat & koreksi, denah, info warga, pengaturan. |
| `/` | Warga | Pengumuman, jaga malam ini & jadwal seminggu, rekap jimpitan per bulan, status per rumah, kontak pengurus. Dibuka dengan **kode warga**. |

Stiker QR berisi alamat `/r/<kode>`: dibuka pakai kamera HP biasa, warga melihat riwayat jimpitan rumah itu, dan petugas yang sudah masuk bisa langsung mencatat.

## Fitur

- **Scan QR per rumah** dari app petugas. Ada tombol senter untuk HP Android dan mendukung iPhone.
- **Ada / Kosong + nominal.** Nominal awal bisa diatur dan diubah saat mencatat.
- **Catat manual kalau QR gagal di-scan:** ketik "A12", "12", atau nama KK. Catatannya ditandai "manual" di riwayat.
- **Tetap jalan tanpa sinyal.** Catatan disimpan di HP dulu, lalu terkirim otomatis begitu online. App petugas bisa dibuka ulang saat offline (service worker).
- **Denah Cluster Natura (SVG)** digambar sebagai kode dari denah cetak (95 kavling, jalan, taman, saluran). Kavling diwarnai sesuai status dan bisa diketuk untuk mencatat. **Tampilan 3D** (three.js) hanya diunduh saat dibuka.
- **Rekap ke WhatsApp** sekali tekan.
- **Jadwal ronda:** admin menempel tabel jadwal dari Excel/Google Sheets. Nama KK ikut terisi otomatis, dan app petugas menampilkan siapa yang **jaga malam ini**.
- **Dashboard admin:** ringkasan malam ini, total bulan ini, grafik 30 malam terakhir, rumah yang sering kosong, dan daftar hal yang belum disiapkan.
- **Riwayat per malam** (jam, petugas, scan/manual) dan koreksi oleh admin.
- **Rekap bulanan** berupa tabel rumah × tanggal, bisa diunduh sebagai CSV.
- **Halaman warga** dengan kode bersama dari pengurus: pengumuman, jadwal, rekap per bulan, status per rumah (tanpa nama), dan kontak (telepon/WhatsApp). Ganti kode kapan saja; akses lama otomatis tidak berlaku.
- **Cetak stiker QR** di kertas A4, bisa difilter per blok.
- **Login nama + PIN.** Akun terkunci 15 menit setelah 5 kali PIN salah. Login bertahan lama supaya petugas tidak perlu login tiap malam.
- **Bisa dipasang di layar utama HP** (PWA). Mode gelap mengikuti pengaturan HP.

Ronda yang lewat tengah malam tetap dihitung malam sebelumnya: jam 00.00–11.59 masuk tanggal kemarin.

## Cara pakai

1. Buka `/admin/` pertama kali, lalu isi nama lingkungan, nominal jimpitan, dan akun admin.
2. Ikuti daftar **Yang perlu disiapkan** di Ringkasan:
   - **Denah → Daftarkan rumah dari denah.** Semua kavling berpenghuni langsung jadi data rumah. Nama KK bisa diisi di **Rumah & QR**.
   - **Petugas:** buat akun tiap petugas beserta PIN-nya.
   - **Jadwal ronda:** tempel tabel jadwal (judul hari seperti "AHAD (MALAM SENIN)", isi "NAMA (BLOK-NO)").
   - **Info warga:** buat kode warga, lalu kirim link-nya ke grup WA. Tambahkan pengumuman dan kontak pengurus.
3. **Rumah & QR → Cetak QR**, cetak di kertas stiker (sebaiknya vinyl atau dilaminasi), lalu tempel dekat wadah jimpitan.
4. Petugas membuka `/petugas/` sekali saat ada sinyal (supaya tersimpan untuk offline), lalu tekan **Scan QR** saat keliling.
5. Selesai ronda, tekan **Bagikan rekap** dan kirim ke grup WA.

> Kamera hanya bisa dipakai lewat **HTTPS** (atau `localhost`). Isi `APP_URL` sebelum mencetak stiker, karena alamat di QR tidak bisa diubah setelah ditempel. Kalau stiker rusak atau hilang, buat QR baru untuk rumah itu di Rumah & QR.

### Mengubah denah

Denah ada di `src/site-plan/natura.ts`. Koordinatnya piksel pada foto denah cetak (2000×1125). Tiap kavling berisi blok, nomor, `built` (`false` = dicoret / belum dibangun), dan titik-titik kelilingnya. Kalau ada rumah baru dibangun, ubah `built` kavling itu menjadi `true`, lalu daftarkan dari halaman Denah.

## Menjalankan di komputer

Butuh [Bun](https://bun.sh) dan Node.js 22.22 atau lebih baru (Vite dan Wrangler berjalan di Node).

```bash
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

Buka http://localhost:5173/admin/. `bun run dev` menjalankan migrasi ke database D1 lokal (di folder `.wrangler/`) lalu menyalakan Vite. API berjalan di runtime Workers yang sama dengan production (workerd), jadi tidak perlu memasang database apa pun.

Untuk mencoba scan dari HP di jaringan yang sama, kamera butuh HTTPS. Pakai tunnel, misalnya `bunx cloudflared tunnel --url http://localhost:5173`.

## Deploy ke Cloudflare (gratis)

Aplikasi berjalan sebagai satu Cloudflare Worker: file app (hasil build Vite) dilayani sebagai static assets, API di `/api/*`, dan datanya di Cloudflare D1.

1. Masuk ke akun Cloudflare: `bunx wrangler login`
2. Buat database di Asia Pasifik (dekat Indonesia):
   ```bash
   bunx wrangler d1 create jimpitan-natura --location apac
   ```
   Salin `database_id` yang muncul ke `wrangler.jsonc`.
3. Jalankan migrasi (sekali di awal, dan setiap ada migrasi baru):
   ```bash
   bun run db:migrate:remote
   ```
4. Simpan kunci sesi (acak, minimal 32 karakter):
   ```bash
   openssl rand -base64 32 | bunx wrangler secret put AUTH_SECRET
   ```
5. Deploy: `bun run deploy`. Alamatnya mis. `https://jimpitan-natura.<akun>.workers.dev`.
6. Isi `APP_URL` di `wrangler.jsonc` dengan alamat tetap aplikasi (atau domain sendiri), deploy ulang, baru cetak stiker QR.

Paket gratis Workers dan D1 cukup untuk satu perumahan. Worker memakai Smart Placement supaya berjalan dekat database.

## Teknologi

- [Vite](https://vite.dev) + React 19 + [React Router](https://reactrouter.com) + [TanStack Query](https://tanstack.com/query) + Tailwind CSS 4: tiga SPA dalam satu build
- [Hono](https://hono.dev) di [Cloudflare Workers](https://developers.cloudflare.com/workers/) untuk API; klien memanggilnya lewat `hono/client` sehingga ikut dicek TypeScript
- [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) + [Drizzle ORM](https://orm.drizzle.team)
- Pemindai QR: `BarcodeDetector` bawaan browser bila ada, [jsQR](https://github.com/cozmo/jsQR) sebagai cadangan (iPhone)
- Tampilan 3D: [three.js](https://threejs.org) (dimuat terpisah saat dibutuhkan)
- Login: PIN di-hash dengan PBKDF2 (WebCrypto), sesi berupa JWT di cookie httpOnly ([jose](https://github.com/panva/jose))
- Offline: service worker (`public/sw.js`) + antrean di `localStorage`

Catatan D1: maksimal 100 parameter per query (insert banyak baris dipecah otomatis) dan tidak ada transaksi interaktif (pakai `db.batch`).

### Struktur

```
index.html, petugas/index.html, admin/index.html   Halaman awal tiap app
src/
  apps/warga/       Halaman warga (/) dan halaman rumah (/r/:kode)
  apps/petugas/     App petugas: Ronda (scanner, antrean offline), riwayat, jadwal, akun
  apps/admin/       Dashboard admin
  features/         Bagian yang dipakai beberapa app: masuk, riwayat, jadwal
  components/       Komponen UI, pemindai QR, denah 2D & 3D
  client/           Klien API, cache data, status login
  server/           Worker + API Hono (routes/), skema & query D1, login
  site-plan/        Denah Cluster Natura sebagai kode
  lib/              Logika bersama (tanggal ronda, rekap, jadwal, format, QR, geometri denah)
drizzle/            Migrasi SQL (dijalankan wrangler)
test/               Tes Vitest; tes API memakai D1 lokal (Miniflare)
```

### Perintah

| Perintah | Fungsi |
| --- | --- |
| `bun run dev` | Server development (Vite + Worker + D1 lokal) |
| `bun run build` / `bun run preview` | Build production / jalankan hasil build secara lokal |
| `bun run deploy` | Build lalu deploy ke Cloudflare |
| `bun run test` | Tes (Vitest). Bukan `bun test`, itu test runner bawaan Bun. |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript |
| `bun run db:generate` | Buat migrasi baru setelah mengubah `src/server/schema.ts` |
| `bun run db:migrate:local` / `db:migrate:remote` | Jalankan migrasi ke D1 lokal / Cloudflare |

## Ide pengembangan berikutnya

- Buku kas: pengeluaran (konsumsi ronda, kegiatan sosial) dan saldo
- Pengingat jadwal jaga untuk petugas
- Mencatat lokasi GPS saat scan sebagai bukti kunjungan
- Ekspor Excel/PDF yang lebih rapi
