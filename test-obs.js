// Test OBS Connection
import 'dotenv/config';
import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();

async function testConnection() {
    const host = process.env.OBS_HOST || 'localhost';
    const port = process.env.OBS_PORT || '4455';
    const password = process.env.OBS_PASSWORD || '';

    const url = `ws://${host}:${port}`;

    console.log('Testing OBS Connection...');
    console.log(`URL: ${url}`);
    console.log(`Password: ${password ? '***set***' : '(empty)'}`);

    try {
        await obs.connect(url, password || undefined);
        console.log('✅ Connected to OBS successfully!');

        const { currentProgramSceneName } = await obs.call('GetCurrentProgramScene');
        console.log(`📺 Current scene: ${currentProgramSceneName}`);

        const { scenes } = await obs.call('GetSceneList');
        console.log('📋 Available scenes:');
        scenes.forEach(s => console.log(`   - ${s.sceneName}`));

        await obs.disconnect();
        console.log('✅ Test complete!');
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('Full error:', error);
    }

    process.exit(0);
}

testConnection();
