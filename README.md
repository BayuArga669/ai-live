# TikTok Live AI Assistant

AI assistant untuk TikTok Live yang membaca chat, memproses dengan Gemini API, dan menghasilkan respons suara via Eleven Labs.

## Fitur

- ✅ **Baca Chat TikTok Live** - Otomatis membaca chat penonton
- ✅ **AI Response dengan Gemini** - Generate balasan cerdas sesuai konteks produk
- ✅ **Text-to-Speech** - Ubah respons jadi suara dengan Eleven Labs
- ✅ **Audio Output ke OBS** - Suara diputar via desktop audio untuk capture OBS
- ✅ **Demo Mode** - Testing tanpa perlu TikTok Live aktif

## Instalasi

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup API Keys

Copy `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Edit `.env` dan isi dengan API keys Anda:

```env
# TikTok username yang sedang live
TIKTOK_USERNAME=username_tiktok

# API Keys
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### 3. Setup Produk

Edit `data/products.json` dengan daftar produk Anda:

```json
{
  "store_name": "Nama Toko Anda",
  "products": [
    {
      "name": "Nama Produk",
      "price": 150000,
      "description": "Deskripsi produk",
      "stock": 50
    }
  ],
  "promotions": [
    {
      "code": "LIVE10",
      "discount": 10,
      "description": "Diskon 10% khusus live"
    }
  ]
}
```

## Penggunaan

### Mode Live (Koneksi ke TikTok Live)

```bash
npm start
```

Pastikan TikTok Live sudah aktif sebelum menjalankan.

### Mode Demo (Testing)

```bash
npm run demo
```

Di mode demo, Anda bisa:
- Ketik pesan untuk simulasi chat
- Ketik `auto` untuk auto-generate chat demo
- Ketik `quit` untuk keluar

## Setup OBS

1. Buka OBS
2. Tambahkan source **Audio Output Capture** atau **Desktop Audio**
3. Pastikan audio dari aplikasi ini ter-capture
4. Atur volume sesuai kebutuhan

## Cara Mendapatkan API Keys

### Gemini API Key (Gratis)
1. Buka [Google AI Studio](https://aistudio.google.com/apikey)
2. Login dengan akun Google
3. Klik "Create API Key"
4. Copy API key ke `.env`

### Eleven Labs API Key
1. Buka [Eleven Labs](https://elevenlabs.io/)
2. Daftar/login
3. Buka Profile > API Keys
4. Copy API key ke `.env`

## Troubleshooting

### "Failed to connect to TikTok Live"
- Pastikan username benar
- Pastikan live sudah aktif
- Coba restart aplikasi

### Audio tidak terdengar di OBS
- Cek Desktop Audio di OBS sudah aktif
- Pastikan volume tidak mute
- Test dengan mode demo dulu

## Lisensi

MIT License
