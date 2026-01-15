import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Gemini AI Processor
 * Processes chat messages and generates responses
 */
export class GeminiProcessor {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        this.products = null;
        this.systemPrompt = '';
        this.maxResponseLength = parseInt(process.env.MAX_RESPONSE_LENGTH) || 200;
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

        this.systemPrompt = `Kamu adalah asisten penjualan live streaming untuk "${this.products.store_name}".

PANDUAN RESPONS:
1. Jawab dalam Bahasa Indonesia yang ramah dan natural
2. Jawab singkat maksimal 2-3 kalimat saja
3. Selalu sebut nama penanya di awal jawaban
4. Jika ditanya produk, berikan info harga dan deskripsi singkat
5. Jika ditanya stok, cek dari daftar produk
6. Promosikan promo yang sedang berlaku jika relevan
7. Ajak penonton untuk order melalui keranjang kuning

DAFTAR PRODUK:
${productList || 'Belum ada produk'}

PROMO AKTIF:
${promoList}

CONTOH RESPONS:
- "Halo kak [nama]! Produk X harganya Rp xxx ribu ya kak, langsung klik keranjang kuning aja!"
- "Ready kak! Stoknya masih banyak, langsung checkout aja ya!"

Ingat: JANGAN memberikan jawaban panjang, cukup 2-3 kalimat singkat yang to the point.`;
    }

    async processMessage(chatData) {
        const { nickname, message } = chatData;

        try {
            const prompt = `${this.systemPrompt}

PERTANYAAN dari "${nickname}": "${message}"

Berikan respons singkat (maksimal ${this.maxResponseLength} karakter):`;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            // Trim response if too long
            const cleanResponse = response.trim().substring(0, this.maxResponseLength);

            console.log(`🤖 AI Response: ${cleanResponse}`);
            return cleanResponse;
        } catch (error) {
            console.error('❌ Gemini Error:', error.message);
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
