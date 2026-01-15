import 'dotenv/config';
import readline from 'readline';
import { TikTokListener, DemoTikTokListener } from './tiktok-listener.js';
import { AIProcessor } from './ai-processor.js';
import { TTSService } from './tts-service.js';
import { AudioPlayer } from './audio-player.js';

/**
 * TikTok Live AI Assistant
 * Main orchestrator that connects all modules
 */
class TikTokAIAssistant {
    constructor() {
        this.isDemo = process.argv.includes('--demo');
        this.tiktokUsername = process.env.TIKTOK_USERNAME;
        this.responseDelay = parseInt(process.env.RESPONSE_DELAY_MS) || 2000;

        // Validate environment variables
        this.validateConfig();

        // Initialize modules
        this.tiktok = this.isDemo
            ? new DemoTikTokListener()
            : new TikTokListener(this.tiktokUsername);
        this.ai = new AIProcessor(process.env.GROQ_API_KEY);
        this.tts = new TTSService(process.env.ELEVENLABS_API_KEY);
        this.audioPlayer = new AudioPlayer();

        // Chat queue to avoid overwhelming the AI
        this.chatQueue = [];
        this.isProcessing = false;
    }

    validateConfig() {
        const required = ['GROQ_API_KEY', 'ELEVENLABS_API_KEY'];

        if (!this.isDemo) {
            required.push('TIKTOK_USERNAME');
        }

        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.error('❌ Missing environment variables:');
            missing.forEach(key => console.error(`   - ${key}`));
            console.error('\n📝 Copy .env.example ke .env dan isi dengan API keys Anda');
            process.exit(1);
        }
    }

    async start() {
        console.log('\n🚀 TikTok Live AI Assistant');
        console.log('================================');
        console.log(`Mode: ${this.isDemo ? 'DEMO' : 'LIVE'}`);
        console.log(`Response Delay: ${this.responseDelay}ms`);
        console.log('================================\n');

        // Setup event handlers
        this.setupEventHandlers();

        try {
            // Connect to TikTok Live
            await this.tiktok.connect();

            // If demo mode, setup console input
            if (this.isDemo) {
                this.setupDemoInput();
            }

            // Cleanup old audio files periodically
            setInterval(() => {
                this.tts.cleanupAudio();
            }, 60000); // Every minute

            console.log('\n✨ AI Assistant siap menjawab chat!\n');

        } catch (error) {
            console.error('Failed to start:', error.message);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        // Handle incoming chat
        this.tiktok.on('chat', async (chatData) => {
            this.chatQueue.push(chatData);

            if (!this.isProcessing) {
                this.processChatQueue();
            }
        });

        // Handle gifts - say thank you
        this.tiktok.on('gift', async (giftData) => {
            const thankYouMessage = `Wah terima kasih banyak kak ${giftData.nickname} untuk ${giftData.giftName} nya! Love you kak!`;
            await this.respondWithVoice(thankYouMessage);
        });

        // Handle new followers
        this.tiktok.on('follow', async (followData) => {
            const welcomeMessage = `Terima kasih kak ${followData.nickname} sudah follow! Selamat bergabung di live kita ya kak!`;
            await this.respondWithVoice(welcomeMessage);
        });

        // Handle disconnection
        this.tiktok.on('disconnected', () => {
            console.log('\n⚠️ Terputus dari TikTok Live. Mencoba reconnect...');
            setTimeout(() => {
                this.tiktok.connect().catch(console.error);
            }, 5000);
        });

        // Handle errors
        this.tiktok.on('error', (error) => {
            console.error('TikTok Error:', error.message);
        });
    }

    async processChatQueue() {
        if (this.chatQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const chatData = this.chatQueue.shift();

        try {
            // Add delay to avoid spam
            await this.delay(this.responseDelay);

            // Generate AI response
            const response = await this.ai.processMessage(chatData);

            // Convert to speech and play
            await this.respondWithVoice(response);

        } catch (error) {
            console.error('Error processing chat:', error.message);
        }

        // Process next in queue
        this.processChatQueue();
    }

    async respondWithVoice(text) {
        try {
            // Generate speech
            const audioPath = await this.tts.textToSpeech(text);

            // Play audio (OBS will capture from desktop audio)
            await this.audioPlayer.play(audioPath);

        } catch (error) {
            console.error('TTS/Audio Error:', error.message);
        }
    }

    setupDemoInput() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log('\n📝 Demo Mode Commands:');
        console.log('   - Ketik pesan untuk simulasi chat');
        console.log('   - "auto" untuk auto-generate demo chats');
        console.log('   - "quit" untuk keluar\n');

        rl.on('line', (input) => {
            const trimmed = input.trim();

            if (trimmed.toLowerCase() === 'quit') {
                console.log('👋 Bye!');
                process.exit(0);
            }

            if (trimmed.toLowerCase() === 'auto') {
                console.log('🤖 Auto-generating demo chat...');
                this.tiktok.simulateChat();
                return;
            }

            if (trimmed) {
                this.tiktok.simulateChat({
                    username: 'demo_user',
                    nickname: 'Demo User',
                    message: trimmed,
                });
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Start the assistant
const assistant = new TikTokAIAssistant();
assistant.start();
