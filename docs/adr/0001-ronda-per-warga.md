# Tugas ronda melekat pada warga

Jadwal menugaskan orang tertentu, sementara rumah hanya menunjukkan alamatnya. Karena warga dapat didata sebelum memiliki akun, `ronda_schedule` merujuk `residents.id`; akun dipakai untuk masuk dan memeriksa hak pencatatan, bukan sebagai identitas penugasan. Membuat akun, pindah rumah, dan mengimpor jadwal tidak otomatis mengambil tugas berdasarkan rumah.

Migrasi mengubah rujukan akun lama ke profilnya yang sudah ada dan mempertahankan urutan serta warna jadwal. Baris rumah/nama yang belum terhubung tetap disimpan sebagai penanda untuk dipilih petugasnya secara eksplisit; nama atau alamat saja tidak cukup untuk menggabungkan identitas warga.
