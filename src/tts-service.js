import ElevenLabs from 'elevenlabs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Eleven Labs Text-to-Speech Service
 */
export class TTSService {
    constructor(apiKey) {
        this.client = new ElevenLabs.ElevenLabsClient({ apiKey });
        // Default to "Adam" voice which supports Indonesian
        this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
        this.audioDir = path.join(__dirname, '..', 'audio');

        // Ensure audio directory exists
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
        }

        console.log(`🔊 TTS Service initialized with voice: ${this.voiceId}`);
    }

    async textToSpeech(text, filename = null) {
        try {
            const outputFilename = filename || `tts-${Date.now()}.mp3`;
            const outputPath = path.join(this.audioDir, outputFilename);

            console.log(`🎙️ Generating speech: "${text.substring(0, 50)}..."`);

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

            console.log(`✅ Audio saved: ${outputFilename}`);
            return outputPath;
        } catch (error) {
            console.error('❌ TTS Error:', error.message);
            throw error;
        }
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
