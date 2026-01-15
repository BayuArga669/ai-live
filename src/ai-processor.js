import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Groq AI Processor
 * Processes chat messages and generates responses using Groq API
 */
export class AIProcessor {
    constructor(apiKey) {
        this.groq = new Groq({ apiKey });
        this.model = 'llama-3.3-70b-versatile'; // Fast and capable model
        this.products = null;
        this.systemPrompt = '';
        this.maxResponseLength = parseInt(process.env.MAX_RESPONSE_LENGTH) || 1000;
        this.loadProductData();
        this.buildSystemPrompt();
    }

    loadProductData() {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'products.json');
            const data = fs.readFileSync(dataPath, 'utf-8');
            this.products = JSON.parse(data);
            console.log(`📦 Loaded ${this.products.products.length} products from data`);
        } catch (error) {
            console.warn('⚠️ Tidak bisa load products.json, menggunakan data default');
            this.products = {
                store_name: 'Toko Online',
                products: [],
                promotions: []
            };
        }
    }

    buildSystemPrompt() {
        const productList = this.products.products.map(p =>
            `- ${p.name}: Rp ${p.price.toLocaleString('id-ID')} (${p.description}, stok: ${p.stock})`
        ).join('\n');

        const promoList = this.products.promotions?.map(p =>
            `- Kode "${p.code}": ${p.description}`
        ).join('\n') || 'Tidak ada promo saat ini';

        this.systemPrompt = `Kamu adalah host penjualan live streaming yang ANTUSIAS dan DETAIL untuk "${this.products.store_name}".

GAYA BICARA:
- Bicara seperti host live shopping yang energik dan meyakinkan
- Gunakan bahasa santai tapi meyakinkan
- Berikan penjelasan yang DETAIL tentang produk
- Jelaskan MANFAAT dan KEUNGGULAN produk
- Buat penonton merasa HARUS BELI sekarang

PANDUAN RESPONS:
1. Selalu sapa dengan "Halo kak [nama]!" di awal
2. Jelaskan produk dengan DETAIL (4-6 kalimat)
3. Sebutkan KEUNGGULAN dan MANFAAT produk
4. Bandingkan dengan harga pasaran jika relevan
5. Mention promo yang sedang berlaku
6. Akhiri dengan ajakan untuk klik keranjang kuning

PENTING - FORMAT HARGA:
- JANGAN gunakan format angka seperti "Rp 150.000"
- SELALU sebutkan harga dalam kata-kata:
  - 150000 → "seratus lima puluh ribu rupiah"
  - 250000 → "dua ratus lima puluh ribu rupiah"
  - 1500000 → "satu juta lima ratus ribu rupiah"

DAFTAR PRODUK:
${productList || 'Belum ada produk'}

PROMO AKTIF:
${promoList}

CONTOH RESPONS YANG BAIK:
"Halo kak Budi! Wah kak, produk ini bagus banget loh! Bahannya premium berkualitas tinggi, nyaman dipakai sehari-hari. Harganya cuma seratus lima puluh ribu rupiah aja kak, padahal di tempat lain bisa dua ratus ribuan loh! Stoknya terbatas banget kak, tinggal beberapa aja. Buruan langsung klik keranjang kuning sebelum kehabisan ya kak! Jangan sampai nyesel!"

Ingat: Buat penonton TERTARIK dan YAKIN untuk membeli!`;
    }

    async processMessage(chatData) {
        const { nickname, message } = chatData;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: `Pertanyaan dari "${nickname}": "${message}"` }
                ],
                model: this.model,
                max_tokens: 500,
                temperature: 0.7,
            });

            const response = completion.choices[0]?.message?.content || '';

            // Trim response if too long
            const cleanResponse = response.trim().substring(0, this.maxResponseLength);

            console.log(`🤖 AI Response: ${cleanResponse}`);
            return cleanResponse;
        } catch (error) {
            console.error('❌ Groq Error:', error.message);
            return `Halo kak ${nickname}! Maaf ya, coba tanya lagi ya kak~`;
        }
    }

    // Reload products (useful if products.json is updated)
    reloadProducts() {
        this.loadProductData();
        this.buildSystemPrompt();
        console.log('🔄 Products reloaded');
    }
}
