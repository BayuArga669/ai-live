import { WebcastPushConnection } from 'tiktok-live-connector';
import { EventEmitter } from 'events';

/**
 * TikTok Live Chat Listener
 * Connects to TikTok Live and emits chat events
 */
export class TikTokListener extends EventEmitter {
  constructor(username) {
    super();
    this.username = username;
    this.connection = null;
    this.isConnected = false;
    this.recentMessages = new Set(); // For spam filtering
    this.messageTimeout = 5000; // 5 seconds cooldown per user
  }

  async connect() {
    console.log(`🔄 Menghubungkan ke TikTok Live: @${this.username}...`);
    
    this.connection = new WebcastPushConnection(this.username, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      enableWebsocketUpgrade: true,
      requestPollingIntervalMs: 2000,
      sessionId: null,
    });

    try {
      const state = await this.connection.connect();
      this.isConnected = true;
      console.log(`✅ Terhubung ke TikTok Live!`);
      console.log(`📺 Room ID: ${state.roomId}`);
      console.log(`👥 Viewers: ${state.viewerCount}`);
      
      this.emit('connected', state);
      this.setupListeners();
      
      return state;
    } catch (error) {
      console.error(`❌ Gagal terhubung: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  setupListeners() {
    // Chat messages
    this.connection.on('chat', (data) => {
      const messageKey = `${data.userId}-${data.comment}`;
      
      // Spam filter: skip if same user sent same message recently
      if (this.recentMessages.has(messageKey)) {
        return;
      }
      
      // Add to recent messages and remove after timeout
      this.recentMessages.add(messageKey);
      setTimeout(() => {
        this.recentMessages.delete(messageKey);
      }, this.messageTimeout);

      const chatData = {
        id: data.msgId,
        userId: data.userId,
        username: data.uniqueId,
        nickname: data.nickname,
        message: data.comment,
        timestamp: Date.now(),
      };

      console.log(`💬 ${chatData.nickname}: ${chatData.message}`);
      this.emit('chat', chatData);
    });

    // Gift events
    this.connection.on('gift', (data) => {
      console.log(`🎁 ${data.nickname} mengirim ${data.giftName} x${data.repeatCount}`);
      this.emit('gift', {
        userId: data.userId,
        username: data.uniqueId,
        nickname: data.nickname,
        giftName: data.giftName,
        giftCount: data.repeatCount,
        diamondCount: data.diamondCount,
      });
    });

    // New followers
    this.connection.on('follow', (data) => {
      console.log(`❤️ ${data.nickname} mulai follow!`);
      this.emit('follow', {
        userId: data.userId,
        username: data.uniqueId,
        nickname: data.nickname,
      });
    });

    // Connection events
    this.connection.on('disconnected', () => {
      console.log('⚠️ Terputus dari TikTok Live');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.connection.on('error', (error) => {
      console.error('❌ Error:', error);
      this.emit('error', error);
    });
  }

  disconnect() {
    if (this.connection) {
      this.connection.disconnect();
      this.isConnected = false;
      console.log('👋 Terputus dari TikTok Live');
    }
  }
}

/**
 * Demo mode - simulates TikTok chat for testing
 */
export class DemoTikTokListener extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.demoMessages = [
      { username: 'user1', nickname: 'Pembeli 1', message: 'halo kak, produk masih ready?' },
      { username: 'user2', nickname: 'Pembeli 2', message: 'berapa harga nya kak?' },
      { username: 'user3', nickname: 'Pembeli 3', message: 'ada diskon ga kak?' },
      { username: 'user4', nickname: 'Pembeli 4', message: 'bisa cod ga kak?' },
      { username: 'user5', nickname: 'Pembeli 5', message: 'warna apa aja yang ready?' },
    ];
    this.currentIndex = 0;
  }

  async connect() {
    console.log('🔄 Mode Demo - Simulasi TikTok Live...');
    this.isConnected = true;
    console.log('✅ Mode Demo aktif! Ketik pesan untuk simulasi chat.');
    this.emit('connected', { roomId: 'demo', viewerCount: 100 });
    return { roomId: 'demo', viewerCount: 100 };
  }

  // Simulate a chat message
  simulateChat(message = null) {
    if (!message) {
      const demoMsg = this.demoMessages[this.currentIndex % this.demoMessages.length];
      this.currentIndex++;
      message = demoMsg;
    }

    const chatData = {
      id: `demo-${Date.now()}`,
      userId: message.userId || `user-${Date.now()}`,
      username: message.username || 'demo_user',
      nickname: message.nickname || 'Demo User',
      message: message.message || message,
      timestamp: Date.now(),
    };

    console.log(`💬 ${chatData.nickname}: ${chatData.message}`);
    this.emit('chat', chatData);
    return chatData;
  }

  disconnect() {
    this.isConnected = false;
    console.log('👋 Mode Demo dimatikan');
  }
}
