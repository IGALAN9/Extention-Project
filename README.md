# Fake News Detector Extension
 
Browser extension untuk membantu pengguna mengecek indikasi hoaks pada teks yang mereka temui saat browsing. Dibangun dengan [WXT](https://wxt.dev/) + React, terhubung ke model deep learning untuk klasifikasi berita hoaks.

## Status
 
Project ini masih dalam tahap pengembangan aktif.
 
### Progress
 
**Selesai**
<br>
- [x] Reading highlighted text (baca teks yang di-highlight user di halaman)
- [x] API integration (Railway dengan API lokal sebagai cadangan)
- [x] Checking / hasil deteksi tampil di popup extension
<br>

**Belum**
<br>
- [x] Automatic text reading (scan otomatis tanpa perlu highlight manual)
- [x] Integrasi Facebook
- [x] Integrasi X (Twitter)
- [x] Integrasi Threads
- [x] Text scraping (ambil teks dari struktur halaman platform tersebut)

## Tech Stack
 
- [WXT](https://wxt.dev/) — framework untuk browser extension
- React + TypeScript
- FastAPI (backend model, repo terpisah / lihat folder API)

### 2. API Model
 
Mode Auto dan Manual mengirim teks yang diperiksa ke `https://model-production-ce77.up.railway.app/predict/explain` terlebih dulu. Jika Railway gagal dihubungi, melewati batas waktu prediksi 25 detik, atau tidak bisa melayani prediksi, extension mencoba `http://localhost:8000/predict/explain`. Jalankan API lokal (via Docker atau langsung) agar cadangan tersedia. Permintaan yang ditolak karena input tidak valid tidak dikirim ulang.

Indikator koneksi memeriksa ketersediaan `/openapi.json` dari kedua alamat dengan prioritas yang sama. Indikator ini tidak menjalankan inferensi.
