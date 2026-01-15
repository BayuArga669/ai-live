// API Base URL
const API_URL = '';

// State
let ws = null;

// DOM Elements
const panels = document.querySelectorAll('.panel');
const navItems = document.querySelectorAll('.nav-item');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const demoMode = document.getElementById('demoMode');
const demoInput = document.getElementById('demoInput');
const demoMessage = document.getElementById('demoMessage');
const sendDemo = document.getElementById('sendDemo');
const chatLogs = document.getElementById('chatLogs');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupWebSocket();
    loadSettings();
    loadProducts();
    setupEventListeners();
});

// Navigation
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const panelId = item.dataset.panel;

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            panels.forEach(p => p.classList.remove('active'));
            document.getElementById(panelId).classList.add('active');
        });
    });
}

// WebSocket
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
            updateStatus(data.isRunning);
        } else if (data.type === 'log') {
            addChatLog(data.log);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(setupWebSocket, 3000);
    };
}

// Update Status
function updateStatus(isRunning) {
    statusDot.classList.toggle('online', isRunning);
    statusText.textContent = isRunning ? 'Online' : 'Offline';
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;

    if (isRunning && demoMode.checked) {
        demoInput.style.display = 'flex';
    } else {
        demoInput.style.display = 'none';
    }
}

// Add Chat Log
function addChatLog(log) {
    const emptyState = chatLogs.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = `chat-item ${log.type}`;

    const time = new Date(log.timestamp).toLocaleTimeString('id-ID');

    let content = '';
    switch (log.type) {
        case 'chat':
            content = `
        <div class="chat-header">
          <span class="chat-user">💬 ${log.data.nickname}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">${log.data.message}</div>
      `;
            break;
        case 'response':
            content = `
        <div class="chat-header">
          <span class="chat-user">🤖 AI → ${log.data.nickname}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">${log.data.response}</div>
      `;
            break;
        case 'gift':
            content = `
        <div class="chat-header">
          <span class="chat-user">🎁 ${log.data.nickname}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">Mengirim ${log.data.giftName} x${log.data.giftCount}</div>
      `;
            break;
        case 'follow':
            content = `
        <div class="chat-header">
          <span class="chat-user">❤️ ${log.data.nickname}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">Mulai mengikuti!</div>
      `;
            break;
        case 'status':
            content = `
        <div class="chat-header">
          <span class="chat-user">📢 Status</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">${log.data.message}</div>
      `;
            break;
        case 'error':
            content = `
        <div class="chat-header">
          <span class="chat-user">❌ Error</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-message">${log.data.message}</div>
      `;
            break;
        default:
            content = `<div class="chat-message">${JSON.stringify(log.data)}</div>`;
    }

    item.innerHTML = content;
    chatLogs.insertBefore(item, chatLogs.firstChild);

    // Keep only last 100 items
    while (chatLogs.children.length > 100) {
        chatLogs.removeChild(chatLogs.lastChild);
    }
}

// Event Listeners
function setupEventListeners() {
    // Start Bot
    startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        try {
            const res = await fetch(`${API_URL}/api/bot/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ demoMode: demoMode.checked }),
            });
            const data = await res.json();
            if (!data.success) {
                showToast(data.message, 'error');
                startBtn.disabled = false;
            }
        } catch (e) {
            showToast(e.message, 'error');
            startBtn.disabled = false;
        }
    });

    // Stop Bot
    stopBtn.addEventListener('click', async () => {
        stopBtn.disabled = true;
        try {
            await fetch(`${API_URL}/api/bot/stop`, { method: 'POST' });
        } catch (e) {
            showToast(e.message, 'error');
        }
    });

    // Demo Send
    sendDemo.addEventListener('click', sendDemoMessage);
    demoMessage.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendDemoMessage();
    });

    // Save Settings
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // Save Products
    document.getElementById('saveProducts').addEventListener('click', saveProducts);

    // Add Product
    document.getElementById('addProduct').addEventListener('click', () => {
        addProductItem({});
    });

    // Add Promo
    document.getElementById('addPromo').addEventListener('click', () => {
        addPromoItem({});
    });
}

// Send Demo Message
async function sendDemoMessage() {
    const message = demoMessage.value.trim();
    if (!message) return;

    try {
        await fetch(`${API_URL}/api/demo/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        demoMessage.value = '';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Load Settings
async function loadSettings() {
    try {
        const res = await fetch(`${API_URL}/api/settings`);
        const data = await res.json();

        document.getElementById('tiktokUsername').value = data.tiktokUsername || '';
        document.getElementById('groqApiKey').value = data.groqApiKey || '';
        document.getElementById('elevenlabsApiKey').value = data.elevenlabsApiKey || '';
        document.getElementById('voiceId').value = data.voiceId || 'pNInz6obpgDQGcFmaJgB';
        document.getElementById('responseDelay').value = data.responseDelay || 2000;
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

// Save Settings
async function saveSettings() {
    const settings = {
        tiktokUsername: document.getElementById('tiktokUsername').value,
        groqApiKey: document.getElementById('groqApiKey').value,
        elevenlabsApiKey: document.getElementById('elevenlabsApiKey').value,
        voiceId: document.getElementById('voiceId').value,
        responseDelay: parseInt(document.getElementById('responseDelay').value),
    };

    try {
        const res = await fetch(`${API_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
        const data = await res.json();
        if (data.success) {
            showToast('Settings saved!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Load Products
async function loadProducts() {
    try {
        const res = await fetch(`${API_URL}/api/products`);
        const data = await res.json();

        document.getElementById('storeName').value = data.store_name || '';

        const productList = document.getElementById('productList');
        productList.innerHTML = '';
        (data.products || []).forEach(p => addProductItem(p));

        const promoList = document.getElementById('promoList');
        promoList.innerHTML = '';
        (data.promotions || []).forEach(p => addPromoItem(p));
    } catch (e) {
        console.error('Failed to load products:', e);
    }
}

// Add Product Item
function addProductItem(product) {
    const productList = document.getElementById('productList');
    const index = productList.children.length;

    const item = document.createElement('div');
    item.className = 'product-item';
    item.innerHTML = `
    <div class="product-header">
      <h4>Produk ${index + 1}</h4>
      <button class="btn btn-remove" onclick="this.parentElement.parentElement.remove()">🗑️ Hapus</button>
    </div>
    <div class="form-group">
      <label>Nama Produk</label>
      <input type="text" class="product-name" value="${product.name || ''}" placeholder="Nama produk">
    </div>
    <div class="form-group">
      <label>Harga (Rupiah)</label>
      <input type="number" class="product-price" value="${product.price || ''}" placeholder="150000">
    </div>
    <div class="form-group">
      <label>Deskripsi</label>
      <textarea class="product-description" placeholder="Deskripsi produk">${product.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>Stok</label>
      <input type="number" class="product-stock" value="${product.stock || ''}" placeholder="50">
    </div>
    <div class="form-group">
      <label>🎬 OBS Scene</label>
      <input type="text" class="product-obs-scene" value="${product.obs_scene || ''}" placeholder="Scene Produk 1">
      <small>Nama scene di OBS yang akan ditampilkan saat produk ini disebutkan</small>
    </div>
  `;

    productList.appendChild(item);
}

// Add Promo Item
function addPromoItem(promo) {
    const promoList = document.getElementById('promoList');

    const item = document.createElement('div');
    item.className = 'promo-item';
    item.innerHTML = `
    <div class="promo-header">
      <h4>Promo</h4>
      <button class="btn btn-remove" onclick="this.parentElement.parentElement.remove()">🗑️ Hapus</button>
    </div>
    <div class="form-group">
      <label>Kode Promo</label>
      <input type="text" class="promo-code" value="${promo.code || ''}" placeholder="LIVE10">
    </div>
    <div class="form-group">
      <label>Diskon (%)</label>
      <input type="number" class="promo-discount" value="${promo.discount || ''}" placeholder="10">
    </div>
    <div class="form-group">
      <label>Deskripsi</label>
      <input type="text" class="promo-description" value="${promo.description || ''}" placeholder="Diskon khusus penonton live">
    </div>
  `;

    promoList.appendChild(item);
}

// Save Products
async function saveProducts() {
    const products = [];
    document.querySelectorAll('.product-item').forEach((item, index) => {
        products.push({
            id: index + 1,
            name: item.querySelector('.product-name').value,
            price: parseInt(item.querySelector('.product-price').value) || 0,
            description: item.querySelector('.product-description').value,
            stock: parseInt(item.querySelector('.product-stock').value) || 0,
            obs_scene: item.querySelector('.product-obs-scene').value || '',
        });
    });

    const promotions = [];
    document.querySelectorAll('.promo-item').forEach(item => {
        promotions.push({
            code: item.querySelector('.promo-code').value,
            discount: parseInt(item.querySelector('.promo-discount').value) || 0,
            description: item.querySelector('.promo-description').value,
        });
    });

    const data = {
        store_name: document.getElementById('storeName').value,
        products,
        promotions,
    };

    try {
        const res = await fetch(`${API_URL}/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        if (result.success) {
            showToast('Products saved!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
