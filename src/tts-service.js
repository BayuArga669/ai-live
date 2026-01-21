import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Eleven Labs Text-to-Speech Service with Multiple API Key Support
 * Automatically rotates to the next API key when credits are exhausted
 */
export class TTSService {
    constructor(apiKeys) {
        // Support multiple API keys (comma-separated string or array)
        if (typeof apiKeys === 'string') {
            this.apiKeys = apiKeys.split(',').map(k => k.trim()).filter(k => k);
        } else if (Array.isArray(apiKeys)) {
            this.apiKeys = apiKeys.filter(k => k);
        } else {
            this.apiKeys = [apiKeys];
        }

        this.currentKeyIndex = 0;
        this.client = new ElevenLabsClient({ apiKey: this.getCurrentApiKey() });
        // Default to "Adam" voice which supports Indonesian
        this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
        this.audioDir = path.join(__dirname, '..', 'audio');

        // Usage tracking
        this.usageStats = {
            totalCharacters: 0,
            sessionCharacters: 0,
            requestCount: 0,
            lastRequestChars: 0,
            history: [] // Last 50 requests for graph
        };

        // Ensure audio directory exists
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
        }

        console.log(`🔊 TTS Service initialized with ${this.apiKeys.length} API key(s), voice: ${this.voiceId}`);
    }

    // Get current usage stats
    getUsageStats() {
        return { ...this.usageStats };
    }

    // Reset session stats
    resetSessionStats() {
        this.usageStats.sessionCharacters = 0;
        this.usageStats.requestCount = 0;
        this.usageStats.history = [];
    }

    getCurrentApiKey() {
        return this.apiKeys[this.currentKeyIndex];
    }

    rotateApiKey() {
        const previousIndex = this.currentKeyIndex;
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;

        // Reinitialize client with new API key
        this.client = new ElevenLabsClient({ apiKey: this.getCurrentApiKey() });

        console.log(`🔄 Rotated API key from index ${previousIndex} to ${this.currentKeyIndex}`);
        return this.currentKeyIndex !== 0; // Returns false if we've cycled through all keys
    }

    isQuotaError(error) {
        // Check for quota exhaustion errors (401 unauthorized or 429 rate limit)
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.statusCode || error.status;

        return (
            statusCode === 401 ||
            statusCode === 429 ||
            message.includes('quota') ||
            message.includes('limit') ||
            message.includes('exceeded') ||
            message.includes('credits') ||
            message.includes('unauthorized') ||
            message.includes('insufficient')
        );
    }

    async textToSpeech(text, filename = null) {
        const outputFilename = filename || `tts-${Date.now()}.mp3`;
        const outputPath = path.join(this.audioDir, outputFilename);

        let lastError = null;
        const startKeyIndex = this.currentKeyIndex;

        // Try with current and all remaining API keys
        do {
            try {
                console.log(`🎙️ Generating speech (API key ${this.currentKeyIndex + 1}/${this.apiKeys.length}): "${text.substring(0, 50)}..."`);

                const audio = await this.client.textToSpeech.convert(this.voiceId, {
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    output_format: 'mp3_44100_128',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                });

                // Write audio stream to file
                const chunks = [];
                for await (const chunk of audio) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                fs.writeFileSync(outputPath, buffer);

                // Track usage
                const charCount = text.length;
                this.usageStats.totalCharacters += charCount;
                this.usageStats.sessionCharacters += charCount;
                this.usageStats.requestCount++;
                this.usageStats.lastRequestChars = charCount;
                this.usageStats.history.push({
                    timestamp: Date.now(),
                    characters: charCount
                });
                // Keep only last 50 entries
                if (this.usageStats.history.length > 50) {
                    this.usageStats.history.shift();
                }

                console.log(`✅ Audio saved: ${outputFilename} (${charCount} chars used)`);
                return outputPath;
            } catch (error) {
                lastError = error;
                console.error(`❌ TTS Error with API key ${this.currentKeyIndex + 1}:`, error.message);

                // Check if this is a quota/auth error and we have more keys to try
                if (this.isQuotaError(error) && this.apiKeys.length > 1) {
                    console.log(`⚠️ API key ${this.currentKeyIndex + 1} may have exhausted credits, trying next key...`);
                    const hasMoreKeys = this.rotateApiKey();

                    // If we've cycled back to the start, all keys are exhausted
                    if (this.currentKeyIndex === startKeyIndex) {
                        console.error('❌ All API keys have been tried and failed');
                        break;
                    }
                } else {
                    // Not a quota error, don't retry
                    throw error;
                }
            }
        } while (this.currentKeyIndex !== startKeyIndex);

        // All keys failed
        throw lastError || new Error('All ElevenLabs API keys exhausted or failed');
    }

    // List available voices (useful for setup)
    async listVoices() {
        try {
            const voices = await this.client.voices.getAll();
            console.log('Available voices:');
            voices.voices.forEach(v => {
                console.log(`  - ${v.voice_id}: ${v.name} (${v.labels?.accent || 'N/A'})`);
            });
            return voices.voices;
        } catch (error) {
            console.error('Error listing voices:', error.message);
            throw error;
        }
    }

    // Clean up old audio files
    cleanupAudio(maxAgeMs = 300000) { // Default: 5 minutes
        try {
            const files = fs.readdirSync(this.audioDir);
            const now = Date.now();
            let deleted = 0;

            files.forEach(file => {
                const filePath = path.join(this.audioDir, file);
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                if (age > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            });

            if (deleted > 0) {
                console.log(`🧹 Cleaned up ${deleted} old audio files`);
            }
        } catch (error) {
            console.warn('Warning: Could not cleanup audio files:', error.message);
        }
    }
}
