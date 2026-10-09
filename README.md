# Cluster Natura

Sistem informasi dan layanan warga Cluster Natura. Saat ini mencakup pendataan warga dan keluarga, status hunian, rumah, jimpitan, ronda, kas, iuran, pembagian akses pengurus, pengumuman, dan kontak pengurus. Fitur berikutnya dikembangkan bertahap memakai data warga, rumah, dan akun yang sama.

Untuk jimpitan, setiap rumah punya stiker QR di dekat wadahnya. Petugas ronda scan QR-nya, tekan **Ada** atau **Kosong**, dan rekapnya langsung tersusun.

Satu project dan database, empat pintu masuk:

| Alamat production | Alamat dev/preview | Untuk | Isi |
| --- | --- | --- | --- |
| `app.clusternatura.com` | `/petugas/` | Petugas ronda (HP) | Scan QR, catat manual, denah 2D/3D, jaga malam ini, riwayat, jadwal. Tetap jalan tanpa sinyal. |
| `dashboard.clusternatura.com` | `/admin/` | Pengurus (laptop/HP) | Ringkasan, peta ronda, riwayat & koreksi (dengan log catatan), rekap bulanan, kas & iuran, warga & keluarga, jadwal, akun & akses, data rumah & cetak QR, info warga, pengaturan. |
| `info.clusternatura.com` | `/` | Warga | Pengumuman, jaga malam ini & jadwal seminggu, rekap jimpitan per bulan, status per rumah, kas, kontak pengurus. Dibuka dengan **kode warga**. |
| `clusternatura.com` | `/landing/` | Pengunjung | Halaman sementara **Under maintenance** dengan tautan ke layanan yang tersedia. |

Di subdomain, setiap app dimulai di `/`: misalnya `dashboard.clusternatura.com/rekap` dan `app.clusternatura.com/jadwal`. Sesi login berlaku di subdomain Natura yang sama; API tetap di `/api/*` pada masing-masing host dan memeriksa peran akun. Dev/preview dan domain Vercel memakai alamat lama agar tetap bisa dicoba tanpa DNS khusus.

Stiker QR berisi alamat `https://info.clusternatura.com/r/<kode>`: dibuka pakai kamera HP biasa, warga melihat riwayat jimpitan rumah itu, dan petugas yang sudah masuk bisa langsung mencatat. QR lama yang memakai domain Vercel tetap bisa dibuka; login di domain berbeda tidak ikut berpindah.

## Fitur

- **Warga per orang:** tambah/edit nama dan nomor telepon, cari warga, saring per blok atau tanpa rumah. Rumah boleh ditentukan nanti; satu rumah dapat memiliki beberapa warga. Daftar ini hanya bisa dibuka Admin, Ketua, dan Sekretaris.
- **Warga dan akun terhubung:** buat akun petugas untuk warga yang sudah didata tanpa membuat orang baru. Warga boleh tidak memiliki akun. Profil yang terhubung akun membaca nama dan rumah langsung dari akun; perubahan di Warga atau Akun petugas langsung konsisten. Nomor telepon tidak ditampilkan di info warga atau QR.
- **Keluarga dan hunian:** menu **Warga** memiliki tab **Daftar warga** dan **Keluarga**. Kelompok keluarga memilih kepala, pasangan, anak, orang tua, atau anggota lainnya dari orang yang sama; satu rumah dapat menampung beberapa keluarga. Status hunian dicatat per orang (pemilik, penyewa, anggota keluarga, lainnya), beserta tanggal mulai tinggal dan riwayat perpindahan. Memindahkan keluarga memperbarui rumah seluruh anggota, termasuk akun petugas dan jadwalnya. Kepala keluarga dipindahkan bersama anggota; anggota yang pindah sendiri dilepas dari keluarga lama.
- **Iuran lingkungan:** tentukan jenis dan nominal per rumah, periode bulanan atau sekali bayar, serta tanggal jatuh tempo. Pengurus menekan **Terbitkan tagihan** untuk bulan yang dipilih, untuk semua rumah terdaftar (termasuk kosong) atau rumah pilihan. Penerbitan ulang tidak menggandakan tagihan; perubahan tarif berlaku untuk tagihan baru. Pembayaran sebagian/lunas, tunai/transfer, tanggal penerimaan, catatan, dan bukti gambar didukung. Pembayaran masuk kas sekali pada tanggal diterima. Tagihan dan penerimaan dibatalkan tanpa menghapus riwayat; bukti hanya bisa dibaca pengelola keuangan.
- **Akun & akses:** Admin dan Ketua mengelola semua fitur serta akses akun; Sekretaris mengelola warga, keluarga, rumah, jadwal, dan informasi; Bendahara mengelola kas/iuran serta membaca rumah dan riwayat ronda; Petugas menggunakan app ronda. Izin diperiksa di API setiap permintaan, dan perubahan peran/status mencabut sesi lama. Peran atau status akun sendiri tidak dapat diturunkan. Akun yang sudah ada mempertahankan perannya.
- **Dashboard pengurus:** menu Lingkungan (Warga, Rumah & QR, Info warga), Ronda & jimpitan, Keuangan (Kas, Iuran), dan Akun & akses menyesuaikan izin pengguna.
- **Scan QR per rumah** dari app petugas. Ada tombol senter untuk HP Android dan mendukung iPhone.
- **Ada / Kosong + nominal.** Nominal awal bisa diatur dan diubah saat mencatat.
- **Catat manual kalau QR gagal di-scan:** ketik "A12", "12", atau nama KK. Catatannya ditandai "manual" di riwayat.
- **Tetap jalan tanpa sinyal.** Catatan disimpan di HP dulu, lalu terkirim otomatis begitu online. App petugas bisa dibuka ulang saat offline (service worker).
- **Denah Cluster Natura (SVG)** digambar sebagai kode dari denah cetak (95 kavling, jalan, taman, saluran). Kavling diwarnai sesuai status dan bisa diketuk untuk mencatat. **Tampilan 3D** (three.js) hanya diunduh saat dibuka.
- **Rekap ke WhatsApp** sekali tekan.
- **Jadwal ronda yang bisa diubah:** tempel tabel jadwal dari Excel/Google Sheets, lalu atur langsung di dashboard. Tambah orang, hapus, urutkan, atau pindahkan ke malam lain lewat drag & drop atau menu ⋯, lalu simpan sekaligus. App petugas menampilkan siapa yang **jaga malam ini** dan menandai "Kamu jaga malam ini".
- **Warna jadwal seperti tabel warga:** hijau = bisa standby, kuning/oranye = kadang-kadang, biru = tidak bisa, putih = kosong/mudik/dijual/dilelang/over. Keterangan warna tampil di jadwal dan ekspor gambar. Warna ikut terbaca saat tabel ditempel dari Excel/Google Sheets, dan bisa diubah per baris di editor jadwal.
- **Permintaan ubah jadwal:** petugas meminta pindah atau tambah malam jaga dari app petugas (menu Akun atau Jadwal) beserta alasannya. Admin melihatnya di halaman Jadwal (ada penanda jumlah di menu dan Ringkasan), lalu menyetujui (jadwal langsung berubah) atau menolak dengan catatan.
- **Petugas terhubung ke rumah dan jadwal:** halaman Petugas punya pencarian, filter (admin, nonaktif, belum dijadwalkan), dan dialog untuk mengatur rumah tiap petugas. Malam jaganya tampil di dialog itu tapi diubah di satu tempat saja, **Jadwal ronda**; petugas yang menempati rumah yang sudah dijadwalkan langsung memakai jadwal rumah itu. PIN petugas baru dibuat acak dan bisa langsung dikirim lewat WhatsApp.
- **Hanya yang jaga malam itu yang bisa mencatat:** scan QR dan catat manual ditolak kalau malam itu bukan jadwal jaganya, termasuk untuk admin. Server yang memeriksa, juga untuk catatan dari antrean offline dan dari halaman QR rumah. App petugas menyembunyikan tombol Scan/Manual dan menunjukkan jadwalnya sendiri. Admin tetap bisa mengoreksi catatan lewat Riwayat di dashboard.
- **Lokasi saya di denah:** petugas bisa menyalakan lokasi di tampilan Denah untuk melihat posisinya dan sedang di kavling/blok mana, lalu mematikannya lagi. Sebelumnya admin mengkalibrasi denah sekali di **Admin → Rumah & QR → Denah → Lokasi GPS** dengan minimal 3 titik acuan yang berjauhan: ketuk titiknya di denah, lalu isi koordinat dari Google Maps atau "Pakai lokasi saya". Selisih tiap titik ditampilkan supaya titik yang salah kelihatan. Lokasi hanya dipakai di HP, tidak dikirim ke server, dan butuh alamat https.
- **Log catatan:** setiap scan QR, catat manual, dan koreksi admin tercatat lengkap (siapa, rumah mana, jam berapa, jam terkirim kalau HP sempat offline), lalu dicocokkan dengan jadwal jaga malam itu. Tab **Log catatan** di detail malam Riwayat menandai tiap catatan "Jaga" atau "Tidak dijadwalkan", menampilkan petugas jaga yang belum mencatat dan rumah yang dicatat lebih dari satu petugas. Tab Rumah dan Ringkasan memberi peringatan kalau ada yang perlu diperiksa.
- **Data petugas dan rumah satu sumber:** nama warga di rumah yang dihuni petugas adalah nama akunnya, dan jadwal hanya menyimpan rujukan ke akun atau rumah. Nama yang diubah di **Petugas** atau di **Rumah & QR** langsung berubah di jadwal, denah, app petugas, dan halaman warga; petugas yang pindah rumah membawa jadwalnya. Nama boleh kembar asal rumahnya beda; di halaman masuk rumahnya ikut ditampilkan.
- **Dashboard admin:** ringkasan malam ini, total bulan ini, saldo kas, grafik 30 malam terakhir, rumah yang sering kosong, dan daftar hal yang perlu diperhatikan.
- **Pembayaran mingguan/bulanan:** atur cara bayar tiap rumah di **Rumah & QR** (nominal per hari, tanggal berlaku, awal minggu untuk mingguan). Catat uangnya di **Rekap bulanan → Catat pembayaran**, dengan tanggal diterima dan periode yang dibayar. Status hanya **Sudah bayar** atau **Belum bayar**, tanpa jatuh tempo maupun pilihan bayar awal/akhir. Rumah periode otomatis hijau jika lunas, merah/kosong jika belum; tidak wajib discan dan petugas tidak bisa mencatat Ada/Kosong. Warna otomatis tidak membuat transaksi harian baru. Rekap bisa disaring menurut cara bayar dan memisahkan nominal Harian, Mingguan, Bulanan. Mengubah kesepakatan memakai tanggal berlaku baru agar riwayat sebelumnya tetap tersimpan.
- **Kas:** uang jimpitan disetor petugas jaga ke bendahara selesai keliling. Bendahara/admin mencatat setoran tiap malam di **Kas**, langsung dibandingkan dengan jimpitan yang tercatat malam itu (sesuai, kurang, atau lebih). Pengeluaran (mis. lampu pos ronda) dan pemasukan lain (mis. saldo awal) ikut dicatat, jadi saldo awal, saldo akhir bulan, dan saldo sekarang terlihat. Malam yang belum dicatat setorannya (sejak setoran pertama) diingatkan di Ringkasan. Penerimaan iuran ikut dihitung dalam kas tanpa perlu dibuat ulang sebagai pemasukan lain. Ringkasan kas tampil di halaman warga tanpa nama pencatat atau bukti pembayaran, bisa dimatikan di Pengaturan.
- **Riwayat per malam** (jam, petugas, scan/manual) dan koreksi oleh admin.
- **Admin bisa mengisi dan mengubah catatan semua rumah untuk tanggal mana pun yang sudah lewat**, juga malam yang belum ada catatannya (mis. dari catatan kertas): buka tanggalnya di Riwayat, lalu ubah per rumah atau **isi semua yang belum dicek sekaligus** (Ada dengan nominal yang sama, atau Kosong). Di Rekap bulanan, tombol **Isi/ubah catatan** membuat setiap kotak rumah × tanggal bisa diketuk. Semua isian admin tercatat di Log catatan sebagai koreksi.
- **Rekap bulanan** berupa tabel rumah × tanggal per blok seperti kalender sebulan (ada, nominal yang bukan nominal awal, kosong, tidak dicek; malam tanpa catatan tampil pudar), dengan pencarian, saringan, dan urutan. Kolom **Bulanan** terpisah dari pengambilan harian; **Mingguan** muncul saat ada pembayarannya. Bisa diunduh sebagai Excel (.xlsx, lembar per rumah, per malam, dan transaksi periode, berwarna) atau CSV. Kolom periode juga tersedia di Google Sheets.
- **Rekap di Google Sheets:** tombol **Sheets** di Rekap bulanan membuat link rahasia yang ditempel di Google Sheets sebagai rumus `=IMPORTDATA(…)`. Sheet-nya terisi sendiri (blok, nomor, nominal tiap malam, tanpa nama warga) dan diperbarui Google kira-kira tiap jam. Pilih bulan berjalan (ikut berganti tiap awal bulan) atau satu bulan tertentu. Link bisa diganti atau dimatikan kapan saja. Google mengambil link dari servernya sendiri, jadi aplikasinya harus sudah online. `IMPORTDATA` hanya membawa isi sel. Apps Script [`scripts/google-sheets.gs`](scripts/google-sheets.gs) (tempel di Ekstensi → Apps Script) melengkapinya: `rapikanRekap` memasang warna dan format seperti file Excel (sekali per lembar; formatnya tetap ada saat isinya diperbarui), dan `arsipkanBulan` dengan pemicu harian (dibuat di menu Pemicu Apps Script) memberi lembar bulan berjalan nama bulannya serta membuat tab arsip otomatis tiap bulan berganti (mis. "Oktober 2026", salinan lembar bulan berjalan yang dikunci ke bulan itu).
- **Halaman warga** dengan kode bersama dari pengurus: pengumuman, jadwal, rekap per bulan, status per rumah (tanpa nama), kas, dan kontak (telepon/WhatsApp). Ganti kode kapan saja; akses lama otomatis tidak berlaku.
- **Cetak stiker QR** di kertas A4, bisa difilter per blok.
- **Login nama + PIN.** Akun terkunci 15 menit setelah 5 kali PIN salah. Login bertahan lama supaya petugas tidak perlu login tiap malam.
- **Bisa dipasang di layar utama HP** (PWA). Mode gelap mengikuti pengaturan HP.

Semua waktu memakai WIB. Ronda yang lewat tengah malam tetap dihitung malam sebelumnya: jam 00.00–05.59 masuk tanggal kemarin; mulai jam 06.00 sudah malam hari itu.

## Cara pakai

1. Buka `/admin/` pertama kali, lalu isi nama lingkungan, nominal jimpitan, dan akun admin.
2. Jalankan seed awal (`bun run seed`, atau `bun run seed:remote` untuk Supabase). Lihat [Seed awal](#seed-awal). Setelah itu rumah, jadwal, nama KK, dan akun petugas sudah terisi; sisanya tinggal mengikuti daftar **Yang perlu disiapkan** di Ringkasan. Tanpa seed, semuanya juga bisa diisi lewat dashboard:
   - **Rumah & QR → Denah → Daftarkan rumah dari denah.** Semua kavling berpenghuni langsung jadi data rumah. Nama KK bisa diisi di **Rumah & QR**.
   - **Warga:** daftarkan tiap orang dan pilih rumahnya bila sudah diketahui. Anggota keluarga dapat memakai rumah yang sama.
   - **Akun petugas:** pilih warga yang sudah didata untuk membuat akun, atau pilih Warga baru.
   - **Jadwal ronda:** impor tabel jadwal (judul hari seperti "AHAD (MALAM SENIN)", isi "NAMA (BLOK-NO)"), lalu rapikan langsung di halaman Jadwal.
   - **Info warga:** buat kode warga, lalu kirim link-nya ke grup WA. Tambahkan pengumuman dan kontak pengurus.
3. **Rumah & QR → Cetak QR**, cetak di kertas stiker (sebaiknya vinyl atau dilaminasi), lalu tempel dekat wadah jimpitan.
4. Petugas membuka `/petugas/` sekali saat ada sinyal (supaya tersimpan untuk offline), lalu tekan **Scan QR** saat keliling.
5. Selesai ronda, tekan **Bagikan rekap** dan kirim ke grup WA, lalu setor uangnya ke bendahara. Bendahara mencatatnya di **Kas** (catat juga saldo awal kas sebagai pemasukan lain).

Untuk warga yang membayar mingguan/bulanan, pengurus mencatat **uang yang benar-benar diterima** di Rekap bulanan. Pilih **Langsung bendahara** untuk langsung menambah kas, atau **Petugas, belum disetor** untuk memasukkannya ke pencocokan setoran tanggal penerimaan. Pembayaran yang sudah tercatat tidak dicatat lagi sebagai pemasukan lain atau uang hasil ronda. Petugas tetap mencatat hasil pemeriksaan wadah dan hanya memasukkan uang tambahan yang benar-benar diambil. Koreksi dan pembatalan pembayaran menyimpan log sebelum/sesudah.

Total rekap mengikuti **periode yang dibayar**; kas mengikuti **tanggal uang diterima/disetor**. Contohnya, uang November yang diterima Oktober masuk kolom Bulanan rekap November dan kas Oktober. Mingguan yang melewati dua bulan dibagi sesuai hari di masing-masing bulan. Grafik dan jumlah malam ronda tetap berasal dari kunjungan petugas.

> Kamera hanya bisa dipakai lewat **HTTPS** (atau `localhost`). Isi `APP_URL` sebelum mencetak stiker, karena alamat di QR tidak bisa diubah setelah ditempel. Kalau stiker rusak atau hilang, buat QR baru untuk rumah itu di Rumah & QR.

### Seed awal

`bun run seed` mengisi database dengan data Cluster Natura:

- semua kavling berpenghuni di denah menjadi data rumah (76 rumah),
- jadwal ronda dari `scripts/jadwal-natura.tsv` (salinan tabel jadwal; ubah file ini kalau jadwal berganti) beserta warna selnya dari `scripts/jadwal-natura-warna.tsv`,
- akun petugas untuk setiap nama di jadwal, tinggal di rumah yang tertulis di jadwal, dengan PIN 4 angka acak. Nama kembar ("Wawan" di AD-5 dan AF-7) jadi dua akun bernama sama di rumah berbeda,
- nama KK dari jadwal untuk rumah tanpa akun petugas yang nama KK-nya masih kosong.

Jadwal menunjuk akun petugas (rumahnya dari akun) atau rumah tanpa akun; nama dan rumah tidak disalin ke jadwal.

Jalankan setelah admin pertama dibuat di `/admin/setup`. PIN akun baru disimpan di `petugas-pin.csv` (atau `petugas-pin-remote.csv` untuk Supabase). File itu tidak ikut di-commit; bagikan PIN lewat chat pribadi lalu hapus filenya. Seed aman dijalankan ulang: rumah, nama KK, akun (termasuk yang sudah diganti namanya), dan jadwal yang sudah ada tidak diubah, supaya jadwal yang sudah diatur di dashboard tidak tertimpa. Warna yang masih kosong di jadwal yang sudah ada tetap diisi dari file warna. Untuk mengganti jadwal dengan isi file: `bun run seed --jadwal`.

### Mengubah denah

Denah ada di `src/site-plan/natura.ts`. Koordinatnya piksel pada foto denah cetak (2000×1125). Tiap kavling berisi blok, nomor, `built` (`false` = dicoret / belum dibangun), dan titik-titik kelilingnya. Kalau ada rumah baru dibangun, ubah `built` kavling itu menjadi `true`, lalu daftarkan dari Rumah & QR → Denah.

### Pembaruan warga 7 Oktober 2026

Daftar nama dan alamat warga disimpan sebagai berkas JSON lokal, di luar repo publik. Pratinjau dengan `bun scripts/sync-residents.ts --remote --source /path/warga.json`; simpan dengan menambahkan `--apply` setelah migrasi remote dijalankan. Input berisi `residents` (blok, nomor, nama opsional, status opsional) dan `plans` (alamat rumah, tanggal berlaku, cara bayar, nominal per hari, awal minggu). Gunakan `block`, `number`, `name`, `status` pada baris warga; `house` seperti `Z-13`, `effectiveFrom`, `cadence`, `ratePerNight`, `weekStart` pada kesepakatan. Status `active`/`vacant`, cara bayar `daily`/`weekly`/`monthly`. Kolom lama `dueTiming` dan `graceDays` masih diterima untuk kompatibilitas berkas impor.

Skrip membuat cadangan di `~/.codex/backups/natura`, lalu memperbarui alamat dalam satu transaksi: nama akun untuk rumah yang terhubung ke petugas, nama KK untuk rumah lain, serta status kosong/mudik. Sel kosong mempertahankan data sebelumnya; PIN dan jadwal tidak berubah. Pembaruan 7 Oktober mencakup 93 rumah; kavling gabungan A-1/A-2 dicatat sekali sebagai A-1.

Kesepakatan bulanan memakai Rp500 per hari. Metadata jatuh tempo dari impor lama tetap tersimpan untuk kompatibilitas, tetapi tidak digunakan lagi untuk menentukan status pembayaran. Skrip hanya mengatur kesepakatan dan data warga, tanpa membuat transaksi pembayaran. Aman dijalankan ulang untuk sumber data ini; kesepakatan yang sudah ada tidak ditimpa.

## Menjalankan di komputer

Butuh [Bun](https://bun.sh) dan Node.js 22.22 atau lebih baru (Vite berjalan di Node).

```bash
bun install
cp .env.example .env.local
bun run dev
```

Buka http://localhost:5173/admin/, buat admin pertama, lalu jalankan `bun run seed` di terminal lain. Database lokalnya [PGlite](https://pglite.dev) (Postgres di dalam proses) di folder `.data/`, dimigrasi otomatis, jadi tidak perlu memasang apa pun. PGlite hanya boleh dibuka satu proses, jadi selama `bun run dev` jalan, seed dititipkan ke server dev itu; kalau server dev mati, seed membuka databasenya sendiri.

Mau memakai Postgres lokal (mis. supaya bisa dibuka di DBeaver sambil `bun run dev` jalan)? Isi `DATABASE_URL` di `.env.local`, mis. `postgres://postgres:postgres@localhost:5432/natura`, lalu jalankan `bun run db:migrate` sekali.

Untuk mencoba scan dari HP di jaringan yang sama, kamera butuh HTTPS. Pakai tunnel, misalnya `bunx cloudflared tunnel --url http://localhost:5173`.

## Deploy ke Vercel + Supabase

Keempat bagian (hasil build Vite) dilayani sebagai file statis, API di `/api/*` berjalan sebagai satu Vercel Function (Node), dan datanya di Postgres Supabase. `bun run build` menyusun semuanya di `.vercel/output` (Build Output API); `vercel.json` membuat Vercel memakai Bun dan perintah build itu. Routing host ada di `scripts/app-routing.ts`, dipakai juga oleh dev/preview.

1. **Supabase:** buat project (mis. region Singapore, `ap-southeast-1`) atau pakai yang sudah ada. Di **Connect** ada dua connection string:
   - **Transaction pooler** (port 6543) untuk aplikasi di Vercel,
   - **Session pooler** (port 5432) untuk skrip di komputer dan DBeaver.
2. **Migrasi** dari komputer: isi `REMOTE_DATABASE_URL` di `.env.local` dengan Session pooler, lalu
   ```bash
   bun run db:migrate:remote
   ```
   Jalankan lagi setiap ada migrasi baru. Migrasi berhenti tanpa mengubah apa pun kalau database sudah berisi tabel dari skema lain.
3. **Vercel:** import repo ini (Framework Preset: Other; sisanya diatur `vercel.json`). Di **Settings → Environment Variables** isi:
   - `DATABASE_URL`: Transaction pooler dari Supabase,
   - `AUTH_SECRET`: kunci acak minimal 32 karakter (`openssl rand -base64 32`),
   - `APP_URL`: `https://info.clusternatura.com`, untuk QR rumah, link kode warga, dan ekspor. Saat domain Natura dipakai, link publik otomatis menuju Info warga walaupun dibuka dari dashboard.
4. Deploy (push ke `main`, atau `bunx vercel --prod`). Function otomatis berjalan di region Vercel yang terdekat dengan database, dibaca dari alamat pooler di `DATABASE_URL` (mis. `ap-south-1` → `bom1` Mumbai; kalau tidak terbaca: `sin1`). Bisa dipaksa lewat environment variable `FUNCTION_REGION`.
5. Buka `/admin/setup` di alamat production untuk membuat admin, lalu isi data awal dari komputer: `bun run seed:remote`.
6. Pastikan alamat production sudah final (isi `APP_URL` kalau pakai domain sendiri, lalu deploy ulang), baru cetak stiker QR.

Paket gratis Vercel (Hobby) dan Supabase cukup untuk satu perumahan. Project Supabase gratis di-pause kalau 7 hari tidak dipakai; karena app dipakai tiap malam, ini tidak terjadi.

### Domain Cluster Natura di Cloudflare

1. Tambahkan `clusternatura.com`, `app.clusternatura.com`, `dashboard.clusternatura.com`, dan `info.clusternatura.com` di **Vercel → project natura → Settings → Domains**, semuanya ke environment Production project yang sama. Domain utama memakai landing, bukan redirect ke subdomain. Jika menambahkan `www.clusternatura.com`, arahkan ke domain utama.
2. Di **Cloudflare → clusternatura.com → DNS → Records**, gunakan nilai yang ditampilkan Vercel untuk project ini. Untuk Cloudflare, Vercel meminta record **CNAME** dengan nama `@`, `app`, `dashboard`, dan `info`, dengan **Proxy disabled / DNS only**; Cloudflare melakukan flattening untuk CNAME di domain utama. Nama dan target harus sama dengan petunjuk Vercel. Record email memakai nilainya sendiri.
3. Setelah Vercel menunjukkan konfigurasi valid dan sertifikat siap, deploy hasil build baru. Periksa halaman utama, masuk petugas, dashboard, Info warga, QR rumah, dan pemasangan PWA. App petugas perlu dibuka sekali saat online di alamat baru agar bisa dipakai offline.
4. Sebelum pindah dari domain Vercel, kirim semua antrean catatan offline dari alamat lama. Penyimpanan HP dan pemasangan PWA terikat ke origin; salinannya tidak otomatis pindah ke subdomain baru. Akun, PIN, jadwal, dan riwayat di database tetap sama. Petugas cukup masuk lagi dan memasang app dari alamat baru.

Rujukan konfigurasi DNS: [Vercel — Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

### Membuka database di DBeaver

Buat koneksi PostgreSQL baru dengan isi dari Supabase → **Connect → Session pooler**: host `aws-…pooler.supabase.com`, port `5432`, database `postgres`, user `postgres.<project-ref>`, dan password database. Di tab SSL, nyalakan SSL (mode `require`). Tabelnya ada di skema `public`.

Untuk melihat-lihat, centang **Read-only connection** (di pengaturan koneksi, bagian General → Security): mengubah data langsung di tabel melewati aturan aplikasi (jadwal jaga, jejak audit, nama satu sumber). Cadangan bisa dibuat dari DBeaver (klik kanan database → **Tools → Backup**) atau `pg_dump` dengan connection string yang sama.

## Teknologi

- [Vite](https://vite.dev) + React 19 + [React Router](https://reactrouter.com) + [TanStack Query](https://tanstack.com/query) + Tailwind CSS 4: tiga SPA dalam satu build
- [Hono](https://hono.dev) sebagai Vercel Function untuk API; klien memanggilnya lewat `hono/client` sehingga ikut dicek TypeScript
- Postgres ([Supabase](https://supabase.com) di production, [PGlite](https://pglite.dev) saat development dan tes) + [Drizzle ORM](https://orm.drizzle.team)
- Pemindai QR: `BarcodeDetector` bawaan browser bila ada, [jsQR](https://github.com/cozmo/jsQR) sebagai cadangan (iPhone)
- Tampilan 3D: [three.js](https://threejs.org) (dimuat terpisah saat dibutuhkan)
- Login: PIN di-hash dengan PBKDF2 (WebCrypto), sesi berupa JWT di cookie httpOnly ([jose](https://github.com/panva/jose))
- Offline: service worker (`public/sw.js`) + antrean di `localStorage`

Semua tabel memakai Row Level Security tanpa policy: aplikasi konek sebagai pemilik tabel, jadi Data API Supabase (kunci `anon`) tidak bisa membaca isinya.

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
  server/           API Hono (routes/), skema & query Postgres, login; vercel.ts = function production, dev.ts = untuk `bun run dev`
  site-plan/        Denah Cluster Natura sebagai kode
  lib/              Logika bersama (tanggal ronda, rekap, jadwal, format, QR, geometri denah)
drizzle/            Migrasi SQL (`bun run db:migrate:remote`)
scripts/            Seed awal, data jadwal ronda, migrasi, build untuk Vercel
test/               Tes Vitest; tes API memakai PGlite (atau Postgres lewat TEST_DATABASE_URL)
```

### Perintah

| Perintah | Fungsi |
| --- | --- |
| `bun run dev` | Server development (Vite + API + PGlite lokal atau `DATABASE_URL`) |
| `bun run build` / `bun run preview` | Build untuk Vercel (`.vercel/output`) / jalankan hasil build secara lokal (butuh `DATABASE_URL` ke Postgres) |
| `bun run test` | Tes (Vitest). Bukan `bun test`, itu test runner bawaan Bun. `TEST_DATABASE_URL=postgres://…/postgres` menjalankannya di Postgres sungguhan. |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript |
| `bun run db:generate` | Buat migrasi baru setelah mengubah `src/server/schema.ts` |
| `bun run db:migrate` / `db:migrate:remote` | Jalankan migrasi ke `DATABASE_URL` / Supabase (`REMOTE_DATABASE_URL`) |
| `bun run seed` / `seed:remote` | Isi rumah, jadwal, nama KK, dan akun petugas ke database lokal / Supabase |

Jangan hapus rumah yang sudah mempunyai tagihan, catatan pembayaran, kelompok keluarga, atau riwayat hunian; tandai kosong/mudik bila tidak dihuni.

## Ide pengembangan berikutnya

- Pengingat jadwal jaga untuk petugas
- Mencatat lokasi GPS saat scan sebagai bukti kunjungan
- Ekspor Excel/PDF yang lebih rapi
