import Groq from 'groq-sdk';
import * as database from './database.js';

/**
 * Groq AI Processor
 * Processes chat messages and generates responses using Groq API
 */
export class AIProcessor {
    constructor(apiKey) {
        this.groq = new Groq({ apiKey });
        this.model = 'llama-3.3-70b-versatile';
        this.products = null;
        this.systemPrompt = '';
        this.maxResponseLength = parseInt(process.env.MAX_RESPONSE_LENGTH) || 1000;
        this.conversationHistory = []; // Store recent conversations
        this.recentResponses = []; // Track recent responses to avoid repetition
        this.loadProductData();
        this.buildSystemPrompt();
    }

    loadProductData() {
        try {
            const store_name = database.getSetting('store_name', 'Toko Online');
            const products = database.getAllProducts();
            const promotions = database.getAllPromotions();

            this.products = {
                store_name,
                products: products || [],
                promotions: promotions || []
            };

            console.log(`📦 Loaded ${this.products.products.length} products from database`);
        } catch (error) {
            console.warn('⚠️ Error loading products from database:', error.message);
            this.products = {
                store_name: 'Toko Online',
                products: [],
                promotions: []
            };
        }
    }

    buildSystemPrompt() {
        // Build detailed product list with numbering
        const productList = this.products.products
            .filter(p => p.name && p.name.trim() !== '') // Filter empty products
            .map((p, i) =>
                `${i + 1}. ${p.name} - ${this.priceToWords(p.price)} (${p.description || 'produk unggulan'}, stok: ${p.stock})`
            ).join('\n');

        const promoList = this.products.promotions?.map(p =>
            `- Kode "${p.code}": ${p.description}`
        ).join('\n') || 'Tidak ada promo';

        this.systemPrompt = `Kamu adalah sales live streaming untuk "${this.products.store_name}".

ATURAN WAJIB:
- Sebut nama user dengan "kak [nama]"
- TANPA emoji
- Respons HARUS berbeda setiap kali

LARANGAN MUTLAK:
- DILARANG KERAS bertanya balik kepada user
- DILARANG bilang "apa yang ingin kamu ketahui?"
- DILARANG bilang "mau tahu apa tentang produk ini?"
- DILARANG minta klarifikasi apapun
- JIKA user tanya produk, LANGSUNG JELASKAN!

SAAT USER TANYA PRODUK (spill, produk, harga):
Kamu WAJIB langsung memberikan info lengkap:
1. Nama produk
2. Harga (dalam kata: seratus ribu, bukan 100.000)
3. Deskripsi/keunggulan
4. Ajak beli

FORMAT JAWABAN PRODUK:
"Oke kak [nama]! [Nama Produk] ini harganya [harga dalam kata]. [Deskripsi]. Buruan order kak sebelum kehabisan!"

=== PRODUK TERSEDIA ===
${productList || 'Belum ada produk'}

=== PROMO ===
${promoList}`;
    }

    // Helper to convert price to Indonesian words
    priceToWords(price) {
        if (!price || price === 0) return 'gratis';

        const num = parseInt(price);
        if (num >= 1000000) {
            const juta = Math.floor(num / 1000000);
            const sisa = num % 1000000;
            if (sisa === 0) return `${this.numberWord(juta)} juta rupiah`;
            return `${this.numberWord(juta)} juta ${this.priceToWords(sisa)}`;
        }
        if (num >= 1000) {
            const ribu = Math.floor(num / 1000);
            return `${this.numberWord(ribu)} ribu rupiah`;
        }
        return `${num} rupiah`;
    }

    numberWord(n) {
        const words = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh',
            'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas'];
        if (n <= 15) return words[n];
        if (n < 20) return words[n - 10] + ' belas';
        if (n < 100) {
            const puluhan = Math.floor(n / 10);
            const satuan = n % 10;
            return words[puluhan] + ' puluh' + (satuan ? ' ' + words[satuan] : '');
        }
        if (n < 1000) {
            const ratusan = Math.floor(n / 100);
            const sisa = n % 100;
            const prefix = ratusan === 1 ? 'seratus' : words[ratusan] + ' ratus';
            return prefix + (sisa ? ' ' + this.numberWord(sisa) : '');
        }
        return n.toString();
    }

    async processMessage(chatData) {
        const { nickname, message } = chatData;

        // Build messages with conversation history for context
        const messages = [
            { role: 'system', content: this.systemPrompt }
        ];

        // Add recent conversation history (last 5 exchanges)
        this.conversationHistory.slice(-10).forEach(conv => {
            messages.push(conv);
        });

        // Add instruction to avoid recent responses
        let variationHint = '';
        if (this.recentResponses.length > 0) {
            variationHint = `\n\n[PENTING: Jangan gunakan respons seperti: "${this.recentResponses.slice(-3).join('", "')}" - buat yang BERBEDA!]`;
        }

        // Add random variation seed (NO questions - removed "pertanyaan balik")
        const randomSeeds = [
            'Balas dengan gaya energik',
            'Balas dengan gaya santai',
            'Balas singkat dan friendly',
            'Langsung jelaskan dengan antusias'
        ];
        const seed = randomSeeds[Math.floor(Math.random() * randomSeeds.length)];

        messages.push({
            role: 'user',
            content: `${nickname} bilang: "${message}"${variationHint}\n\n[Style: ${seed}]`
        });

        try {
            const completion = await this.groq.chat.completions.create({
                messages,
                model: this.model,
                max_tokens: 300,
                temperature: 0.8, // Lower for more instruction-following
                top_p: 0.9,
            });

            const response = completion.choices[0]?.message?.content || '';
            const cleanResponse = response.trim().substring(0, this.maxResponseLength);

            // Store in history
            this.conversationHistory.push({ role: 'user', content: `${nickname}: ${message}` });
            this.conversationHistory.push({ role: 'assistant', content: cleanResponse });

            // Keep history manageable
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            // Track recent responses to avoid repetition
            this.recentResponses.push(cleanResponse);
            if (this.recentResponses.length > 10) {
                this.recentResponses.shift();
            }

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

    // Clear conversation history
    clearHistory() {
        this.conversationHistory = [];
        this.recentResponses = [];
    }
}
