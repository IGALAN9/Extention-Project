# Fake News Detector Extension
 
Browser extension untuk membantu pengguna mengecek indikasi hoaks pada teks yang mereka temui saat browsing. Dibangun dengan [WXT](https://wxt.dev/) + React, terhubung ke model deep learning untuk klasifikasi berita hoaks.

## Status
 
Project ini masih dalam tahap pengembangan aktif.
 
### Progress
 
**Selesai**
<br>
- [x] Reading highlighted text (baca teks yang di-highlight user di halaman)
- [x] API integration (koneksi extension ke API model lokal)
- [x] Checking / hasil deteksi tampil di popup extension
<br>

**Belum**
<br>
- [ ] Automatic text reading (scan otomatis tanpa perlu highlight manual)
- [ ] Integrasi Facebook
- [ ] Integrasi X (Twitter)
- [ ] Integrasi Threads
- [ ] Text scraping (ambil teks dari struktur halaman platform tersebut)

## Tech Stack
 
- [WXT](https://wxt.dev/) — framework untuk browser extension
- React + TypeScript
- FastAPI (backend model, repo terpisah / lihat folder API)

### 2. API Model
 
Extension ini membutuhkan API model yang berjalan (default: `http://localhost:8000`). Jalankan API-nya (via Docker atau langsung) sebelum menggunakan fitur cek fakta.
