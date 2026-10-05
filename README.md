# Jimpitan

Aplikasi jimpitan ronda Cluster Natura. Setiap rumah punya stiker QR di dekat wadah jimpitan. Petugas ronda scan QR-nya, tekan **Ada** atau **Kosong**, dan rekapnya langsung tersusun.

Satu aplikasi, tiga bagian:

| Alamat | Untuk | Isi |
| --- | --- | --- |
| `/petugas/` | Petugas ronda (HP) | Scan QR, catat manual, denah 2D/3D, jaga malam ini, riwayat, jadwal. Tetap jalan tanpa sinyal. |
| `/admin/` | Pengurus (laptop/HP) | Dashboard ringkasan, audit catatan, data rumah & cetak QR, petugas, jadwal, rekap bulanan, riwayat & koreksi, denah, info warga, pengaturan. |
| `/` | Warga | Pengumuman, jaga malam ini & jadwal seminggu, rekap jimpitan per bulan, status per rumah, kontak pengurus. Dibuka dengan **kode warga**. |

Stiker QR berisi alamat `/r/<kode>`: dibuka pakai kamera HP biasa, warga melihat riwayat jimpitan rumah itu, dan petugas yang sudah masuk bisa langsung mencatat.

## Fitur

- **Scan QR per rumah** dari app petugas. Ada tombol senter untuk HP Android dan mendukung iPhone.
- **Ada / Kosong + nominal.** Nominal awal bisa diatur dan diubah saat mencatat.
- **Catat manual kalau QR gagal di-scan:** ketik "A12", "12", atau nama KK. Catatannya ditandai "manual" di riwayat.
- **Tetap jalan tanpa sinyal.** Catatan disimpan di HP dulu, lalu terkirim otomatis begitu online. App petugas bisa dibuka ulang saat offline (service worker).
- **Denah Cluster Natura (SVG)** digambar sebagai kode dari denah cetak (95 kavling, jalan, taman, saluran). Kavling diwarnai sesuai status dan bisa diketuk untuk mencatat. **Tampilan 3D** (three.js) hanya diunduh saat dibuka.
- **Rekap ke WhatsApp** sekali tekan.
- **Jadwal ronda yang bisa diubah:** tempel tabel jadwal dari Excel/Google Sheets, lalu atur langsung di dashboard. Tambah orang, hapus, urutkan, atau pindahkan ke malam lain lewat drag & drop atau menu ⋯, lalu simpan sekaligus. App petugas menampilkan siapa yang **jaga malam ini** dan menandai "Kamu jaga malam ini".
- **Warna jadwal seperti tabel aslinya** (hijau, kuning, oranye, putih) di semua chip petugas jaga. Warna ikut terbaca saat tabel ditempel dari Excel/Google Sheets, dan bisa diubah per baris di editor jadwal.
- **Permintaan ubah jadwal:** petugas meminta pindah atau tambah malam jaga dari app petugas (menu Akun atau Jadwal) beserta alasannya. Admin melihatnya di halaman Jadwal (ada penanda jumlah di menu dan Ringkasan), lalu menyetujui (jadwal langsung berubah) atau menolak dengan catatan.
- **Petugas terhubung ke rumah dan jadwal:** halaman Petugas punya pencarian, filter (admin, nonaktif, belum dijadwalkan), dan dialog untuk mengatur rumah serta malam jaga tiap petugas. PIN petugas baru dibuat acak dan bisa langsung dikirim lewat WhatsApp.
- **Hanya yang jaga malam itu yang bisa mencatat:** scan QR dan catat manual ditolak kalau malam itu bukan jadwal jaganya, termasuk untuk admin. Server yang memeriksa, juga untuk catatan dari antrean offline dan dari halaman QR rumah. App petugas menyembunyikan tombol Scan/Manual dan menunjukkan jadwalnya sendiri. Admin tetap bisa mengoreksi catatan lewat Riwayat di dashboard.
- **Lokasi saya di denah:** petugas bisa menyalakan lokasi di tampilan Denah untuk melihat posisinya dan sedang di kavling/blok mana, lalu mematikannya lagi. Sebelumnya admin mengkalibrasi denah sekali di **Admin → Denah** dengan minimal 3 titik acuan yang berjauhan: ketuk titiknya di denah, lalu isi koordinat dari Google Maps atau "Pakai lokasi saya". Selisih tiap titik ditampilkan supaya titik yang salah kelihatan. Lokasi hanya dipakai di HP, tidak dikirim ke server, dan butuh alamat https.
- **Audit catatan:** setiap scan QR, catat manual, dan koreksi admin tercatat lengkap (siapa, rumah mana, jam berapa, jam terkirim kalau HP sempat offline), lalu dicocokkan dengan jadwal jaga malam itu. Halaman **Audit catatan** menandai tiap catatan "Jaga" atau "Tidak dijadwalkan", menampilkan petugas jaga yang belum mencatat, dan Ringkasan memberi peringatan kalau ada catatan dari petugas di luar jadwal.
- **Data petugas dan rumah satu sumber:** nama warga di rumah yang dihuni petugas adalah nama akunnya, dan jadwal hanya menyimpan rujukan ke akun atau rumah. Nama yang diubah di **Petugas** atau di **Rumah & QR** langsung berubah di jadwal, denah, app petugas, dan halaman warga; petugas yang pindah rumah membawa jadwalnya. Nama boleh kembar asal rumahnya beda; di halaman masuk rumahnya ikut ditampilkan.
- **Dashboard admin:** ringkasan malam ini, total bulan ini, grafik 30 malam terakhir, rumah yang sering kosong, dan daftar hal yang belum disiapkan.
- **Riwayat per malam** (jam, petugas, scan/manual) dan koreksi oleh admin.
- **Rekap bulanan** berupa tabel rumah × tanggal per blok (nominal tiap malam, kosong, tidak dicek), dengan pencarian, saringan, dan urutan. Bisa diunduh sebagai Excel (.xlsx, lembar per rumah dan per malam, berwarna) atau CSV.
- **Halaman warga** dengan kode bersama dari pengurus: pengumuman, jadwal, rekap per bulan, status per rumah (tanpa nama), dan kontak (telepon/WhatsApp). Ganti kode kapan saja; akses lama otomatis tidak berlaku.
- **Cetak stiker QR** di kertas A4, bisa difilter per blok.
- **Login nama + PIN.** Akun terkunci 15 menit setelah 5 kali PIN salah. Login bertahan lama supaya petugas tidak perlu login tiap malam.
- **Bisa dipasang di layar utama HP** (PWA). Mode gelap mengikuti pengaturan HP.

Semua waktu memakai WIB. Ronda yang lewat tengah malam tetap dihitung malam sebelumnya: jam 00.00–05.59 masuk tanggal kemarin; mulai jam 06.00 sudah malam hari itu.

## Cara pakai

1. Buka `/admin/` pertama kali, lalu isi nama lingkungan, nominal jimpitan, dan akun admin.
2. Jalankan seed awal (`bun run seed`, atau `bun run seed:remote` untuk Cloudflare). Lihat [Seed awal](#seed-awal). Setelah itu rumah, jadwal, nama KK, dan akun petugas sudah terisi; sisanya tinggal mengikuti daftar **Yang perlu disiapkan** di Ringkasan. Tanpa seed, semuanya juga bisa diisi lewat dashboard:
   - **Denah → Daftarkan rumah dari denah.** Semua kavling berpenghuni langsung jadi data rumah. Nama KK bisa diisi di **Rumah & QR**.
   - **Petugas:** buat akun tiap petugas, pilih rumah dan malam jaganya.
   - **Jadwal ronda:** impor tabel jadwal (judul hari seperti "AHAD (MALAM SENIN)", isi "NAMA (BLOK-NO)"), lalu rapikan langsung di halaman Jadwal.
   - **Info warga:** buat kode warga, lalu kirim link-nya ke grup WA. Tambahkan pengumuman dan kontak pengurus.
3. **Rumah & QR → Cetak QR**, cetak di kertas stiker (sebaiknya vinyl atau dilaminasi), lalu tempel dekat wadah jimpitan.
4. Petugas membuka `/petugas/` sekali saat ada sinyal (supaya tersimpan untuk offline), lalu tekan **Scan QR** saat keliling.
5. Selesai ronda, tekan **Bagikan rekap** dan kirim ke grup WA.

> Kamera hanya bisa dipakai lewat **HTTPS** (atau `localhost`). Isi `APP_URL` sebelum mencetak stiker, karena alamat di QR tidak bisa diubah setelah ditempel. Kalau stiker rusak atau hilang, buat QR baru untuk rumah itu di Rumah & QR.

### Seed awal

`bun run seed` mengisi database dengan data Cluster Natura:

- semua kavling berpenghuni di denah menjadi data rumah (76 rumah),
- jadwal ronda dari `scripts/jadwal-natura.tsv` (salinan tabel jadwal; ubah file ini kalau jadwal berganti) beserta warna selnya dari `scripts/jadwal-natura-warna.tsv`,
- akun petugas untuk setiap nama di jadwal, tinggal di rumah yang tertulis di jadwal, dengan PIN 4 angka acak. Nama kembar ("Wawan" di AD-5 dan AF-7) jadi dua akun bernama sama di rumah berbeda,
- nama KK dari jadwal untuk rumah tanpa akun petugas yang nama KK-nya masih kosong.

Jadwal menunjuk akun petugas (rumahnya dari akun) atau rumah tanpa akun; nama dan rumah tidak disalin ke jadwal.

Jalankan setelah admin pertama dibuat di `/admin/setup`. PIN akun baru disimpan di `petugas-pin.csv` (atau `petugas-pin-remote.csv` untuk Cloudflare). File itu tidak ikut di-commit; bagikan PIN lewat chat pribadi lalu hapus filenya. Seed aman dijalankan ulang: rumah, nama KK, akun (termasuk yang sudah diganti namanya), dan jadwal yang sudah ada tidak diubah, supaya jadwal yang sudah diatur di dashboard tidak tertimpa. Warna yang masih kosong di jadwal yang sudah ada tetap diisi dari file warna. Untuk mengganti jadwal dengan isi file: `bun run seed --jadwal`.

### Mengubah denah

Denah ada di `src/site-plan/natura.ts`. Koordinatnya piksel pada foto denah cetak (2000×1125). Tiap kavling berisi blok, nomor, `built` (`false` = dicoret / belum dibangun), dan titik-titik kelilingnya. Kalau ada rumah baru dibangun, ubah `built` kavling itu menjadi `true`, lalu daftarkan dari halaman Denah.

## Menjalankan di komputer

Butuh [Bun](https://bun.sh) dan Node.js 22.22 atau lebih baru (Vite dan Wrangler berjalan di Node).

```bash
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

Buka http://localhost:5173/admin/, buat admin pertama, lalu jalankan `bun run seed` di terminal lain. `bun run dev` menjalankan migrasi ke database D1 lokal (di folder `.wrangler/`) lalu menyalakan Vite. API berjalan di runtime Workers yang sama dengan production (workerd), jadi tidak perlu memasang database apa pun.

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
6. Buka `/admin/setup` di alamat itu untuk membuat admin, lalu isi data awal: `bun run seed:remote`.
7. Isi `APP_URL` di `wrangler.jsonc` dengan alamat tetap aplikasi (atau domain sendiri), deploy ulang, baru cetak stiker QR.

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
scripts/            Seed awal dan data jadwal ronda
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
| `bun run seed` / `seed:remote` | Isi rumah, jadwal, nama KK, dan akun petugas ke D1 lokal / Cloudflare |

## Ide pengembangan berikutnya

- Buku kas: pengeluaran (konsumsi ronda, kegiatan sosial) dan saldo
- Pengingat jadwal jaga untuk petugas
- Mencatat lokasi GPS saat scan sebagai bukti kunjungan
- Ekspor Excel/PDF yang lebih rapi
