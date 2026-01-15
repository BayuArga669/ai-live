import OBSWebSocket from 'obs-websocket-js';

/**
 * OBS WebSocket Service
 * Controls OBS scenes via WebSocket connection
 */
export class OBSService {
    constructor() {
        this.obs = new OBSWebSocket();
        this.isConnected = false;
        this.host = process.env.OBS_HOST || 'localhost';
        this.port = parseInt(process.env.OBS_PORT) || 4455;
        this.password = process.env.OBS_PASSWORD || '';
        this.mainScene = process.env.OBS_MAIN_SCENE || 'Scene'; // Default main scene
        this.previousScene = null;
    }

    async connect() {
        try {
            const url = `ws://${this.host}:${this.port}`;
            console.log(`🎬 Connecting to OBS at ${url}...`);

            await this.obs.connect(url, this.password || undefined);
            this.isConnected = true;
            console.log('✅ Connected to OBS!');

            // Get current scene for verification
            const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
            console.log(`📺 Current scene: ${currentProgramSceneName}`);
            this.mainScene = process.env.OBS_MAIN_SCENE || currentProgramSceneName;

            // Setup media end event listener
            this.setupMediaEndListener();

            return true;
        } catch (error) {
            console.error('❌ OBS Connection Error:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Setup listener for when media playback ends
     * Automatically returns to main scene
     */
    setupMediaEndListener() {
        this.obs.on('MediaInputPlaybackEnded', async (data) => {
            console.log(`🎬 Media ended: ${data.inputName}`);

            // Return to main scene after media ends
            setTimeout(async () => {
                console.log(`🔄 Returning to main scene: ${this.mainScene}`);
                await this.switchScene(this.mainScene, false); // Don't save as previous
            }, 500); // Small delay before switching back
        });

        console.log('📺 Media end listener setup - will auto-return to main scene');
    }

    async disconnect() {
        if (this.isConnected) {
            await this.obs.disconnect();
            this.isConnected = false;
            console.log('🔌 Disconnected from OBS');
        }
    }

    /**
     * Switch to a specific scene
     * @param {string} sceneName - Name of the scene in OBS
     * @param {boolean} savePrevious - Whether to save previous scene
     */
    async switchScene(sceneName, savePrevious = true) {
        if (!this.isConnected) {
            console.warn('⚠️ OBS not connected, attempting to reconnect...');
            const connected = await this.connect();
            if (!connected) {
                console.error('❌ Cannot switch scene: OBS not connected');
                return false;
            }
        }

        try {
            // Save current scene before switching
            if (savePrevious) {
                const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
                this.previousScene = currentProgramSceneName;
            }

            console.log(`🎬 Switching to scene: ${sceneName}`);
            await this.obs.call('SetCurrentProgramScene', { sceneName });
            console.log(`✅ Switched to scene: ${sceneName}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to switch scene: ${error.message}`);
            return false;
        }
    }

    /**
     * Switch to scene and restart media source
     * @param {string} sceneName - Name of the scene in OBS
     * @param {string} mediaSourceName - Optional: name of media source to restart
     */
    async switchSceneWithMedia(sceneName, mediaSourceName = null) {
        const switched = await this.switchScene(sceneName);

        if (switched && mediaSourceName) {
            try {
                // Restart the media source
                await this.obs.call('TriggerMediaInputAction', {
                    inputName: mediaSourceName,
                    mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
                });
                console.log(`▶️ Restarted media: ${mediaSourceName}`);
            } catch (error) {
                console.error(`❌ Failed to restart media: ${error.message}`);
            }
        }

        return switched;
    }

    /**
     * Return to main scene
     */
    async returnToMainScene() {
        return this.switchScene(this.mainScene, false);
    }

    /**
     * Get list of available scenes
     */
    async getScenes() {
        if (!this.isConnected) {
            await this.connect();
        }

        try {
            const { scenes } = await this.obs.call('GetSceneList');
            return scenes.map(s => s.sceneName);
        } catch (error) {
            console.error('❌ Failed to get scenes:', error.message);
            return [];
        }
    }

    /**
     * Get current scene name
     */
    async getCurrentScene() {
        if (!this.isConnected) {
            await this.connect();
        }

        try {
            const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
            return currentProgramSceneName;
        } catch (error) {
            console.error('❌ Failed to get current scene:', error.message);
            return null;
        }
    }
}
