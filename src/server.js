import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import multer from 'multer';
import { TikTokListener, DemoTikTokListener } from './tiktok-listener.js';
import { AIProcessor } from './ai-processor.js';
import { TTSService } from './tts-service.js';
import { AudioPlayer } from './audio-player.js';
import { OBSService } from './obs-service.js';
import { IdleAudioService } from './idle-audio-service.js';
import * as database from './database.js';

// Migrate from JSON if exists
const jsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'products.json');
database.migrateFromJSON(jsonPath);

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

// Multer config for audio upload
const idleAudioDir = path.join(__dirname, '..', 'audio', 'idle');
if (!fs.existsSync(idleAudioDir)) {
    fs.mkdirSync(idleAudioDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, idleAudioDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.mp3', '.wav', '.ogg', '.m4a'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// State
let botInstance = null;
let isRunning = false;
let chatLogs = [];
let idleAudioService = null;
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
        groqApiKey: process.env.GROQ_API_KEY || '',
        elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
        voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
        responseDelay: parseInt(process.env.RESPONSE_DELAY_MS) || 2000,
        filterEnabled: database.getSetting('filter_enabled', 'false') === 'true',
        filterKeywords: database.getSetting('filter_keywords', ''),
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

    if (groqApiKey) {
        updates.GROQ_API_KEY = groqApiKey;
    }
    if (elevenlabsApiKey) {
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

    // Save filter settings to database
    const { filterEnabled, filterKeywords } = req.body;
    if (filterEnabled !== undefined) {
        database.setSetting('filter_enabled', String(filterEnabled));
    }
    if (filterKeywords !== undefined) {
        database.setSetting('filter_keywords', filterKeywords);
    }

    res.json({ success: true });
});

// Get products
app.get('/api/products', (req, res) => {
    try {
        const store_name = database.getSetting('store_name', 'Toko Saya');
        const products = database.getAllProducts();
        const promotions = database.getAllPromotions();
        res.json({ store_name, products, promotions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save products (bulk update)
app.post('/api/products', (req, res) => {
    try {
        const { store_name, products, promotions } = req.body;

        // Update store name
        if (store_name) {
            database.setSetting('store_name', store_name);
        }

        // Sync products
        if (products && Array.isArray(products)) {
            const existingProducts = database.getAllProducts();
            const existingIds = existingProducts.map(p => p.id);
            const newIds = products.filter(p => p.id).map(p => p.id);

            // Delete removed products
            existingIds.forEach(id => {
                if (!newIds.includes(id)) {
                    database.deleteProduct(id);
                }
            });

            // Update or create products
            products.forEach(p => {
                if (p.id && existingIds.includes(p.id)) {
                    database.updateProduct(p.id, p);
                } else {
                    database.createProduct(p);
                }
            });
        }

        // Sync promotions
        if (promotions && Array.isArray(promotions)) {
            const existingPromos = database.getAllPromotions();
            const existingIds = existingPromos.map(p => p.id);
            const newIds = promotions.filter(p => p.id).map(p => p.id);

            // Delete removed promotions
            existingIds.forEach(id => {
                if (!newIds.includes(id)) {
                    database.deletePromotion(id);
                }
            });

            // Update or create promotions
            promotions.forEach(p => {
                if (p.id && existingIds.includes(p.id)) {
                    database.updatePromotion(p.id, p);
                } else {
                    database.createPromotion(p);
                }
            });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Individual product CRUD
app.post('/api/products/create', (req, res) => {
    try {
        const id = database.createProduct(req.body);
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', (req, res) => {
    try {
        database.updateProduct(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/products/:id', (req, res) => {
    try {
        database.deleteProduct(parseInt(req.params.id));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Individual promotion CRUD
app.post('/api/promotions/create', (req, res) => {
    try {
        const id = database.createPromotion(req.body);
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/promotions/:id', (req, res) => {
    try {
        database.updatePromotion(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/promotions/:id', (req, res) => {
    try {
        database.deletePromotion(parseInt(req.params.id));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============ IDLE AUDIO API ============

// Get idle audio settings
app.get('/api/idle-audio/settings', (req, res) => {
    const intervalSeconds = parseInt(database.getSetting('idle_audio_interval', '30'));
    const isEnabled = database.getSetting('idle_audio_enabled', 'false') === 'true';
    const playMode = database.getSetting('idle_audio_play_mode', 'sequential');
    res.json({ intervalSeconds, isEnabled, playMode });
});

// Update idle audio settings
app.post('/api/idle-audio/settings', (req, res) => {
    try {
        const { intervalSeconds, isEnabled, playMode } = req.body;

        if (intervalSeconds !== undefined) {
            database.setSetting('idle_audio_interval', String(intervalSeconds));
            if (idleAudioService) {
                idleAudioService.setInterval(intervalSeconds);
            }
        }

        if (playMode !== undefined) {
            database.setSetting('idle_audio_play_mode', playMode);
            if (idleAudioService) {
                idleAudioService.setPlayMode(playMode);
            }
        }

        if (isEnabled !== undefined) {
            database.setSetting('idle_audio_enabled', String(isEnabled));
            if (idleAudioService && isRunning) {
                if (isEnabled) {
                    idleAudioService.start();
                } else {
                    idleAudioService.stop();
                }
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all idle audio files
app.get('/api/idle-audio', (req, res) => {
    try {
        const audioList = database.getAllIdleAudio();
        res.json(audioList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload idle audio file
app.post('/api/idle-audio/upload', upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const id = database.createIdleAudio({
            filename: req.file.filename,
            original_name: req.file.originalname,
            description: req.body.description || ''
        });

        res.json({
            success: true,
            id,
            file: {
                filename: req.file.filename,
                original_name: req.file.originalname
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update idle audio
app.put('/api/idle-audio/:id', (req, res) => {
    try {
        database.updateIdleAudio(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete idle audio
app.delete('/api/idle-audio/:id', (req, res) => {
    try {
        const audio = database.getIdleAudioById(parseInt(req.params.id));
        if (audio) {
            // Delete file from disk
            const filePath = path.join(idleAudioDir, audio.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            database.deleteIdleAudio(parseInt(req.params.id));
        }
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

// Get TTS usage stats
app.get('/api/tts/usage', (req, res) => {
    if (botInstance && botInstance.tts) {
        res.json(botInstance.tts.getUsageStats());
    } else {
        res.json({
            totalCharacters: 0,
            sessionCharacters: 0,
            requestCount: 0,
            lastRequestChars: 0,
            history: []
        });
    }
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

        // Load products for scene matching from database
        const products = database.getAllProducts();

        // Initialize idle audio service
        idleAudioService = new IdleAudioService(audioPlayer, database);
        const idleInterval = parseInt(database.getSetting('idle_audio_interval', '30'));
        const idleEnabled = database.getSetting('idle_audio_enabled', 'false') === 'true';
        const idlePlayMode = database.getSetting('idle_audio_play_mode', 'sequential');
        idleAudioService.setInterval(idleInterval);
        idleAudioService.setPlayMode(idlePlayMode);

        // Add idle audio event logging
        idleAudioService.on('playing', ({ audio }) => {
            addLog('idle_audio', { message: `Playing: ${audio.original_name}` });
        });

        // Setup handlers
        tiktok.on('chat', async (chatData) => {
            addLog('chat', chatData);

            // Reset idle timer when there's activity
            if (idleAudioService) {
                idleAudioService.resetIdleTimer();
            }

            // Check filter keywords if enabled (read dynamically for real-time updates)
            const filterKeywords = database.getSetting('filter_keywords', '');
            const filterEnabled = database.getSetting('filter_enabled', 'false') === 'true';

            if (filterEnabled && filterKeywords) {
                const keywords = filterKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                const messageLower = chatData.message.toLowerCase();
                const hasKeyword = keywords.some(keyword => messageLower.includes(keyword));

                if (!hasKeyword) {
                    // Skip this message - doesn't contain any filter keywords
                    return;
                }
            }

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

                // Broadcast TTS usage stats after each call
                broadcast({ type: 'ttsUsage', stats: tts.getUsageStats() });

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

            // Start idle audio if enabled
            if (idleAudioService && idleEnabled) {
                idleAudioService.start();
            }
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

    // Stop idle audio service
    if (idleAudioService) {
        idleAudioService.stop();
        idleAudioService = null;
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
server.listen(PORT, () => {
    console.log(`\n🚀 TikTok Live AI Dashboard`);
    console.log(`================================`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`================================\n`);
});
