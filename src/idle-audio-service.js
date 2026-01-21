import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IdleAudioService extends EventEmitter {
    constructor(audioPlayer, database) {
        super();
        this.audioPlayer = audioPlayer;
        this.database = database;
        this.idleTimer = null;
        this.isEnabled = false;
        this.intervalMs = 30000; // Default 30 seconds
        this.playMode = 'sequential'; // 'sequential' or 'random'
        this.lastActivityTime = Date.now();
        this.isPlaying = false;
        this.audioIndex = 0;
        this.audioDir = path.join(__dirname, '..', 'audio', 'idle');

        // Ensure idle audio directory exists
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
        }
    }

    // Start the idle audio checker
    start() {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
        }

        this.isEnabled = true;
        this.lastActivityTime = Date.now();

        // Check every second if we should play idle audio
        this.idleTimer = setInterval(() => {
            this.checkAndPlayIdle();
        }, 1000);

        this.emit('started');
        console.log(`Idle audio started (interval: ${this.intervalMs / 1000}s)`);
    }

    // Stop the idle audio service
    stop() {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
        this.isEnabled = false;
        this.emit('stopped');
        console.log('Idle audio stopped');
    }

    // Update last activity time (call this when there's a comment)
    resetIdleTimer() {
        this.lastActivityTime = Date.now();
    }

    // Set interval in seconds
    setInterval(seconds) {
        this.intervalMs = seconds * 1000;
        console.log(`Idle audio interval set to ${seconds}s`);
    }

    // Set play mode ('sequential' or 'random')
    setPlayMode(mode) {
        this.playMode = mode === 'random' ? 'random' : 'sequential';
        console.log(`Idle audio play mode set to ${this.playMode}`);
    }

    // Check if we should play idle audio
    async checkAndPlayIdle() {
        if (!this.isEnabled || this.isPlaying) {
            return;
        }

        const idleTime = Date.now() - this.lastActivityTime;

        if (idleTime >= this.intervalMs) {
            await this.playRandomIdleAudio();
            // Reset timer after playing
            this.lastActivityTime = Date.now();
        }
    }

    // Play idle audio based on play mode
    async playRandomIdleAudio() {
        try {
            // Get active audio files from database
            const audioList = this.database.getActiveIdleAudio();

            if (audioList.length === 0) {
                return;
            }

            // Pick audio based on play mode
            let audio;
            if (this.playMode === 'random') {
                const randomIndex = Math.floor(Math.random() * audioList.length);
                audio = audioList[randomIndex];
            } else {
                // Sequential
                audio = audioList[this.audioIndex % audioList.length];
                this.audioIndex++;
            }

            const audioPath = path.join(this.audioDir, audio.filename);

            if (!fs.existsSync(audioPath)) {
                console.log(`Idle audio file not found: ${audioPath}`);
                return;
            }

            this.isPlaying = true;
            this.emit('playing', { audio });

            console.log(`Playing idle audio: ${audio.original_name}`);
            await this.audioPlayer.play(audioPath);

            this.isPlaying = false;
            this.emit('finished', { audio });
        } catch (error) {
            this.isPlaying = false;
            console.error('Error playing idle audio:', error);
            this.emit('error', error);
        }
    }

    // Get settings
    getSettings() {
        return {
            isEnabled: this.isEnabled,
            intervalSeconds: this.intervalMs / 1000,
            playMode: this.playMode,
            audioDir: this.audioDir
        };
    }
}
