import soundPlay from 'sound-play';
import { EventEmitter } from 'events';

/**
 * Audio Player - Plays audio files directly without opening media player
 * Uses sound-play which leverages Windows native audio APIs
 */
export class AudioPlayer extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isPlaying = false;
        console.log('🔈 Audio Player initialized (Direct playback)');
    }

    /**
     * Add audio file to queue and play
     */
    async play(audioPath) {
        this.queue.push(audioPath);

        if (!this.isPlaying) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const audioPath = this.queue.shift();

        console.log(`▶️ Playing: ${audioPath}`);

        try {
            // sound-play plays audio directly without opening media player
            await soundPlay.play(audioPath, 1); // 1 = volume (0-1)
            console.log('✅ Playback complete');
            this.emit('complete', audioPath);
        } catch (error) {
            console.error('❌ Playback error:', error.message);
            this.emit('error', error);
        }

        // Process next in queue
        await this.processQueue();
    }

    /**
     * Stop current playback and clear queue
     */
    stop() {
        this.queue = [];
        this.isPlaying = false;
        console.log('⏹️ Playback stopped');
    }

    /**
     * Get queue length
     */
    getQueueLength() {
        return this.queue.length;
    }
}
