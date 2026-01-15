import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { TikTokListener, DemoTikTokListener } from './tiktok-listener.js';
import { AIProcessor } from './ai-processor.js';
import { TTSService } from './tts-service.js';
import { AudioPlayer } from './audio-player.js';
import { OBSService } from './obs-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// State
let botInstance = null;
let isRunning = false;
let chatLogs = [];
const MAX_LOGS = 100;

// Broadcast to all WebSocket clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(data));
        }
    });
}

// Add to chat log
function addLog(type, data) {
    const log = { type, data, timestamp: new Date().toISOString() };
    chatLogs.unshift(log);
    if (chatLogs.length > MAX_LOGS) chatLogs.pop();
    broadcast({ type: 'log', log });
}

// ============ API ROUTES ============

// Get settings
app.get('/api/settings', (req, res) => {
    res.json({
        tiktokUsername: process.env.TIKTOK_USERNAME || '',
        groqApiKey: process.env.GROQ_API_KEY ? '***configured***' : '',
        elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ? '***configured***' : '',
        voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
        responseDelay: parseInt(process.env.RESPONSE_DELAY_MS) || 2000,
    });
});

// Save settings
app.post('/api/settings', (req, res) => {
    const { tiktokUsername, groqApiKey, elevenlabsApiKey, voiceId, responseDelay } = req.body;

    // Read current .env
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';

    try {
        envContent = fs.readFileSync(envPath, 'utf-8');
    } catch (e) {
        envContent = '';
    }

    // Update values
    const updates = {
        TIKTOK_USERNAME: tiktokUsername,
        ELEVENLABS_VOICE_ID: voiceId,
        RESPONSE_DELAY_MS: responseDelay,
    };

    if (groqApiKey && groqApiKey !== '***configured***') {
        updates.GROQ_API_KEY = groqApiKey;
    }
    if (elevenlabsApiKey && elevenlabsApiKey !== '***configured***') {
        updates.ELEVENLABS_API_KEY = elevenlabsApiKey;
    }

    // Parse and update .env
    const lines = envContent.split('\n');
    const existingKeys = new Set();

    const newLines = lines.map(line => {
        const [key] = line.split('=');
        if (key && updates[key] !== undefined) {
            existingKeys.add(key);
            return `${key}=${updates[key]}`;
        }
        return line;
    });

    // Add new keys
    Object.entries(updates).forEach(([key, value]) => {
        if (!existingKeys.has(key) && value) {
            newLines.push(`${key}=${value}`);
        }
    });

    fs.writeFileSync(envPath, newLines.join('\n'));

    // Update process.env
    Object.entries(updates).forEach(([key, value]) => {
        if (value) process.env[key] = String(value);
    });

    res.json({ success: true });
});

// Get products
app.get('/api/products', (req, res) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf-8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json({ store_name: '', products: [], promotions: [] });
    }
});

// Save products
app.post('/api/products', (req, res) => {
    try {
        fs.writeFileSync(
            path.join(__dirname, '..', 'data', 'products.json'),
            JSON.stringify(req.body, null, 2)
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get bot status
app.get('/api/status', (req, res) => {
    res.json({
        isRunning,
        logsCount: chatLogs.length,
    });
});

// Get chat logs
app.get('/api/logs', (req, res) => {
    res.json(chatLogs);
});

// Start bot
app.post('/api/bot/start', async (req, res) => {
    if (isRunning) {
        return res.json({ success: false, message: 'Bot already running' });
    }

    const { demoMode } = req.body;

    try {
        // Validate config
        if (!process.env.GROQ_API_KEY) {
            return res.status(400).json({ success: false, message: 'GROQ_API_KEY not configured' });
        }
        if (!process.env.ELEVENLABS_API_KEY) {
            return res.status(400).json({ success: false, message: 'ELEVENLABS_API_KEY not configured' });
        }
        if (!demoMode && !process.env.TIKTOK_USERNAME) {
            return res.status(400).json({ success: false, message: 'TIKTOK_USERNAME not configured' });
        }

        // Initialize bot
        const tiktok = demoMode
            ? new DemoTikTokListener()
            : new TikTokListener(process.env.TIKTOK_USERNAME);
        const ai = new AIProcessor(process.env.GROQ_API_KEY);
        const tts = new TTSService(process.env.ELEVENLABS_API_KEY);
        const audioPlayer = new AudioPlayer();
        const obs = new OBSService();

        // Connect to OBS (non-blocking)
        obs.connect().catch(err => {
            console.log('OBS not connected (scene switching disabled)');
        });

        botInstance = { tiktok, ai, tts, audioPlayer, obs, demoMode };

        // Load products for scene matching
        let products = [];
        try {
            const data = fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf-8');
            products = JSON.parse(data).products || [];
        } catch (e) { }

        // Setup handlers
        tiktok.on('chat', async (chatData) => {
            addLog('chat', chatData);

            try {
                const response = await ai.processMessage(chatData);
                addLog('response', { nickname: chatData.nickname, response });

                // Check if any product is mentioned and switch scene
                const messageLower = chatData.message.toLowerCase();
                for (const product of products) {
                    const productNameLower = product.name.toLowerCase();
                    if (messageLower.includes(productNameLower) || messageLower.includes(`produk ${product.id}`)) {
                        if (product.obs_scene && obs.isConnected) {
                            await obs.switchScene(product.obs_scene);
                            addLog('status', { message: `Switched to scene: ${product.obs_scene}` });
                        }
                        break;
                    }
                }

                const audioPath = await tts.textToSpeech(response);
                await audioPlayer.play(audioPath);
            } catch (error) {
                addLog('error', { message: error.message });
            }
        });

        tiktok.on('gift', (data) => addLog('gift', data));
        tiktok.on('follow', (data) => addLog('follow', data));
        tiktok.on('connected', (data) => {
            addLog('status', { message: 'Connected to TikTok Live', ...data });
            broadcast({ type: 'status', isRunning: true });
        });
        tiktok.on('disconnected', () => {
            addLog('status', { message: 'Disconnected from TikTok Live' });
        });
        tiktok.on('error', (error) => {
            addLog('error', { message: error.message });
        });

        await tiktok.connect();
        isRunning = true;

        res.json({ success: true, demoMode });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Stop bot
app.post('/api/bot/stop', (req, res) => {
    if (!isRunning || !botInstance) {
        return res.json({ success: false, message: 'Bot not running' });
    }

    botInstance.tiktok.disconnect();
    botInstance.audioPlayer.stop();
    botInstance = null;
    isRunning = false;

    addLog('status', { message: 'Bot stopped' });
    broadcast({ type: 'status', isRunning: false });

    res.json({ success: true });
});

// Demo chat (for testing)
app.post('/api/demo/chat', (req, res) => {
    if (!isRunning || !botInstance?.demoMode) {
        return res.status(400).json({ success: false, message: 'Demo mode not active' });
    }

    const { message, nickname } = req.body;
    botInstance.tiktok.simulateChat({
        username: 'demo_user',
        nickname: nickname || 'Demo User',
        message,
    });

    res.json({ success: true });
});

// WebSocket connection
wss.on('connection', (ws) => {
    // Send current status
    ws.send(JSON.stringify({ type: 'status', isRunning }));

    // Send recent logs
    chatLogs.slice(0, 20).reverse().forEach(log => {
        ws.send(JSON.stringify({ type: 'log', log }));
    });
});

// Start server
server.listen(PORT, async () => {
    console.log(`\n🚀 TikTok Live AI Dashboard`);
    console.log(`================================`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`================================\n`);

    // Auto-open browser for desktop-like experience
    if (!process.env.NO_BROWSER) {
        await open(`http://localhost:${PORT}`);
    }
});
