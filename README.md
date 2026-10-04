# Jimpitan

Web app untuk mencatat jimpitan saat ronda. Setiap rumah punya stiker QR di dekat wadah jimpitan. Petugas ronda scan QR-nya, tekan **Ada** atau **Kosong**, dan rekapnya langsung tersusun.

## Fitur

- **Scan QR per rumah** langsung dari halaman Ronda. Ada tombol senter untuk HP Android dan mendukung iPhone.
- **Ada / Kosong + nominal.** Nominal awal bisa diatur dan diubah saat mencatat (Rp 500, 1.000, dst).
- **Catat manual kalau QR gagal di-scan:** ketik "A12", "12", atau nama KK, lewat tombol **Manual**, **Ketik manual** di scanner, atau saat kamera tidak bisa dibuka. Catatannya ditandai "manual" di riwayat.
- **Tetap jalan tanpa sinyal.** Catatan disimpan di HP dulu, lalu terkirim otomatis begitu online. Halaman Ronda juga bisa dibuka ulang saat offline.
- **Kotak per blok berwarna:** hijau = ada, merah = kosong, putih = belum dicek. Ada filter "yang belum saja" supaya tidak ada rumah terlewat.
- **Denah perumahan:** rumah tampil di atas gambar denah (foto denah developer, gambar tangan, atau screenshot Google Maps) dengan warna status yang sama, bisa di-zoom dan diketuk untuk mencatat. Tanpa gambar, rumah bisa disusun otomatis per blok. Denah juga muncul di riwayat tiap malam.
- **Rekap ke WhatsApp** sekali tekan, misalnya: *✅ Ada: 47 rumah · ⭕ Kosong: 3 (A-3, B-7, C-1) · 💰 Total: Rp 23.500 · 👮 Petugas: Andi, Budi*.
- **Status rumah kosong/mudik** supaya tidak dihitung bolong.
- **Riwayat per malam**, termasuk jam, petugas, cara mencatat (scan/manual), dan koreksi oleh admin.
- **Rekap bulanan** berupa tabel rumah × tanggal yang bisa diunduh sebagai CSV (Excel/Google Sheets).
- **Halaman warga:** scan stiker QR pakai kamera HP biasa untuk melihat riwayat jimpitan rumah itu tanpa login. Nama KK hanya terlihat oleh petugas.
- **Cetak stiker QR** di kertas A4 (12 per halaman), bisa difilter per blok.
- **Login petugas pakai nama + PIN.** Akun terkunci 5 menit setelah 5 kali PIN salah. Login bertahan lama supaya petugas tidak perlu login tiap malam.
- **Bisa dipasang di layar utama HP** (PWA). Mode gelap mengikuti pengaturan HP.

Ronda yang lewat tengah malam tetap dihitung malam sebelumnya: jam 00.00–11.59 masuk tanggal kemarin.

## Cara pakai

1. Buka aplikasi pertama kali, lalu isi nama lingkungan, nominal jimpitan, dan akun admin.
2. Di **Admin → Data rumah**, tambahkan rumah per blok. Bisa sekaligus, misalnya blok `A` nomor `1-20`.
3. Klik **Cetak QR**, cetak di kertas stiker (sebaiknya vinyl atau dilaminasi), lalu tempel dekat wadah jimpitan.
4. (Opsional) Di **Admin → Denah**, unggah gambar denah, lalu ketuk posisi tiap rumah. Setelah satu rumah ditaruh, rumah berikutnya otomatis terpilih. Tanpa gambar, tekan **Susun otomatis**.
5. Di **Admin → Petugas ronda**, buat akun untuk setiap petugas beserta PIN-nya.
6. Petugas membuka halaman **Ronda** sekali saat ada sinyal (supaya tersimpan untuk offline), lalu tekan **Scan QR** saat keliling. Pilih tampilan **Daftar** atau **Denah** sesuai selera.
7. Selesai ronda, tekan **Bagikan rekap** dan kirim ke grup WA.

> Kamera hanya bisa dipakai lewat **HTTPS** (atau `localhost`). Isi `APP_URL` sebelum mencetak stiker, karena alamat di QR tidak bisa diubah setelah ditempel. Kalau stiker rusak atau hilang, buat QR baru untuk rumah itu di halaman Data rumah.

## Menjalankan di komputer

Butuh Node.js 20.9 atau lebih baru.

```bash
npm install
npm run dev
```

Buka http://localhost:3000. Tanpa `DATABASE_URL`, aplikasi memakai Postgres lokal bawaan (PGlite) di folder `.data/`, jadi tidak perlu memasang database apa pun.

Untuk mencoba scan dari HP di jaringan yang sama, kamera butuh HTTPS. Pakai `npx next dev --experimental-https` atau tunnel (mis. Cloudflare Tunnel).

## Deploy (gratis): Vercel + Supabase

1. **Supabase:** buat project baru. Di **Connect**, salin connection string **Transaction pooler** (port 6543).
2. **Migrasi database** (sekali di awal, dan setiap ada migrasi baru):
   ```bash
   DATABASE_URL="postgres://...pooler.supabase.com:6543/postgres" npm run db:migrate
   ```
   Kalau migrasi lewat transaction pooler gagal, pakai connection string **Session pooler** (port 5432) khusus untuk perintah ini.
3. **Vercel:** import repo ini, lalu isi Environment Variables:
   - `DATABASE_URL`: connection string transaction pooler tadi
   - `AUTH_SECRET`: hasil `openssl rand -base64 32`
   - `APP_URL`: alamat aplikasi, mis. `https://jimpitan-natura.vercel.app`
   - `NEXT_PUBLIC_TIMEZONE`: `Asia/Jakarta` (atau `Asia/Makassar` / `Asia/Jayapura`)
4. Deploy, buka alamatnya, lalu ikuti langkah di **Cara pakai**.

Migrasi juga mengaktifkan Row Level Security di semua tabel, supaya data tidak bisa dibaca lewat API publik Supabase. Aplikasi ini konek langsung sebagai pemilik tabel, jadi tidak terpengaruh.

## Teknologi

- [Next.js 16](https://nextjs.org) (App Router, Server Actions) + React 19 + Tailwind CSS 4
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL (`postgres-js` di production, [PGlite](https://pglite.dev) untuk lokal/tes)
- Pemindai QR: `BarcodeDetector` bawaan browser bila ada, [jsQR](https://github.com/cozmo/jsQR) sebagai cadangan (iPhone)
- Login: PIN di-hash dengan scrypt, sesi berupa JWT di cookie httpOnly ([jose](https://github.com/panva/jose))
- Offline: service worker (`public/sw.js`) + antrean di `localStorage`

### Struktur

```
src/
  app/
    (main)/ronda/        Halaman Ronda: scanner, kotak per rumah, antrean offline
    (main)/riwayat/      Riwayat per malam + koreksi admin
    (main)/rekap/        Rekap bulanan + unduh CSV
    (main)/admin/        Data rumah, cetak QR, denah, petugas, pengaturan
    r/[token]/           Halaman rumah (tujuan QR)
    api/ronda, api/setoran  Data malam ini & sinkronisasi antrean
    api/denah/gambar     Gambar latar denah (unggah: admin, lihat: petugas)
  components/            Komponen UI, pemindai QR, denah
  lib/                   Logika bersama (tanggal ronda, rekap, format, QR, susun denah)
  server/                Database, skema, login, query
drizzle/                 Migrasi SQL
```

### Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development |
| `npm run build` / `npm start` | Build & jalankan production |
| `npm test` | Tes (Vitest, memakai PGlite in-memory) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Buat migrasi baru setelah mengubah `src/server/schema.ts` |
| `npm run db:migrate` | Jalankan migrasi ke `DATABASE_URL` |

## Ide pengembangan berikutnya

- Buku kas: pengeluaran (konsumsi ronda, kegiatan sosial) dan saldo
- Jadwal regu ronda + pengingat
- Mencatat lokasi GPS saat scan sebagai bukti kunjungan
- Jimpitan beras (satuan selain rupiah)
- Ekspor Excel/PDF yang lebih rapi
