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
const demoPlaceholder = document.getElementById('demoPlaceholder');

// Dashboard Stats (will be updated by WebSocket)
let dashboardStats = {
    viewers: 0,
    likes: 0,
    comments: 0
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupWebSocket();
    loadSettings();
    loadProducts();
    loadIdleAudio();
    setupEventListeners();
    setupIdleAudioListeners();
});

// Navigation
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const panelId = item.dataset.panel;

            // Update Nav Items
            navItems.forEach(i => {
                i.classList.remove('active', 'text-white', 'shadow-lg', 'shadow-red-500/20', 'bg-gradient-to-r', 'from-[#ff2d55]', 'to-[#ff6b35]');
                i.classList.add('text-white/60', 'hover:text-white', 'hover:bg-white/5');
            });

            // Add Active Styling
            item.classList.remove('text-white/60', 'hover:text-white', 'hover:bg-white/5');
            item.classList.add('active', 'text-white', 'shadow-lg', 'shadow-red-500/20', 'bg-gradient-to-r', 'from-[#ff2d55]', 'to-[#ff6b35]');

            // Update Panels
            panels.forEach(p => p.classList.add('hidden'));
            panels.forEach(p => p.classList.remove('active', 'flex'));

            const targetPanel = document.getElementById(panelId);
            targetPanel.classList.remove('hidden');
            targetPanel.classList.add('active', 'flex');
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

            // Update stats based on log type
            if (data.log.type === 'chat') {
                dashboardStats.comments++;
                updateDashboardStats();
            }
        } else if (data.type === 'stats') {
            // Handle stats update from server
            dashboardStats = { ...dashboardStats, ...data.stats };
            updateDashboardStats();
        } else if (data.type === 'ttsUsage') {
            // Handle TTS usage stats
            updateTTSUsageGraph(data.stats);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(setupWebSocket, 3000);
    };
}


// Update Status
function updateStatus(isRunning) {
    // Sidebar Status Dot
    if (isRunning) {
        statusDot.classList.remove('bg-red-500', 'shadow-[0_0_10px_rgba(239,68,68,0.5)]');
        statusDot.classList.add('bg-[#00d26a]', 'shadow-[0_0_10px_rgba(0,210,106,0.5)]');
        statusText.textContent = 'Online';
        statusText.classList.add('text-[#00d26a]');
        if (demoPlaceholder) demoPlaceholder.classList.add('hidden');
    } else {
        statusDot.classList.add('bg-red-500', 'shadow-[0_0_10px_rgba(239,68,68,0.5)]');
        statusDot.classList.remove('bg-[#00d26a]', 'shadow-[0_0_10px_rgba(0,210,106,0.5)]');
        statusText.textContent = 'Offline';
        statusText.classList.remove('text-[#00d26a]');
        if (demoPlaceholder) demoPlaceholder.classList.remove('hidden');
    }

    // Dashboard Connection Status
    const sessionTitle = document.getElementById('sessionTitle');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    const modeLabel = document.getElementById('modeLabel');

    if (sessionTitle) {
        sessionTitle.textContent = isRunning ? 'Active Session' : 'Waiting to Connect';
    }
    if (connectionDot) {
        connectionDot.classList.remove('bg-gray-500', 'bg-green-500', 'animate-pulse');
        if (isRunning) {
            connectionDot.classList.add('bg-green-500', 'animate-pulse');
        } else {
            connectionDot.classList.add('bg-gray-500');
        }
    }
    if (connectionText) {
        connectionText.textContent = isRunning
            ? (demoMode.checked ? 'Demo Mode Active' : 'Connected to TikTok Live')
            : 'Not connected';
        connectionText.classList.remove('text-white/50', 'text-green-400');
        connectionText.classList.add(isRunning ? 'text-green-400' : 'text-white/50');
    }
    if (modeLabel) {
        modeLabel.textContent = demoMode.checked ? 'Demo' : 'Live';
    }

    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;

    // Toggle demo input visibility
    if (demoInput) {
        if (isRunning && demoMode.checked) {
            demoInput.classList.remove('hidden');
            demoInput.classList.add('flex');
        } else {
            demoInput.classList.add('hidden');
            demoInput.classList.remove('flex');
        }
    }

    // Reset activity when going offline
    if (!isRunning) {
        activityLevel = 0;
    }
}

// Update Dashboard Stats Display
function updateDashboardStats() {
    const viewersEl = document.getElementById('statViewers');
    const likesEl = document.getElementById('statLikes');
    const commentsEl = document.getElementById('statComments');

    if (viewersEl) viewersEl.textContent = formatNumber(dashboardStats.viewers);
    if (likesEl) likesEl.textContent = formatNumber(dashboardStats.likes);
    if (commentsEl) commentsEl.textContent = formatNumber(dashboardStats.comments);
}

// Format numbers (e.g., 1500 -> 1.5K)
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Add Chat Log
function addChatLog(log) {
    const emptyState = chatLogs.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = 'p-4 rounded-xl text-sm border-l-4 mb-3 backdrop-blur-sm';

    // Type-specific colors
    let borderColor = 'border-gray-500';
    let bgColor = 'bg-white/5';

    switch (log.type) {
        case 'chat':
            borderColor = 'border-blue-400';
            bgColor = 'bg-blue-500/5';
            break;
        case 'response':
            borderColor = 'border-[#00d26a]';
            bgColor = 'bg-[#00d26a]/5';
            break;
        case 'gift':
            borderColor = 'border-yellow-400';
            bgColor = 'bg-yellow-500/10';
            break;
        case 'follow':
            borderColor = 'border-pink-500';
            bgColor = 'bg-pink-500/10';
            break;
        case 'error':
            borderColor = 'border-red-500';
            bgColor = 'bg-red-500/10';
            break;
        case 'status':
            borderColor = 'border-purple-500';
            bgColor = 'bg-purple-500/5';
            break;
        case 'idle_audio':
            borderColor = 'border-cyan-400';
            bgColor = 'bg-cyan-500/5';
            break;
    }

    item.classList.add(borderColor, bgColor);

    const time = new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let content = '';
    const userClass = "font-semibold text-white/90";
    const msgClass = "mt-1 text-white/70 leading-relaxed";

    switch (log.type) {
        case 'chat':
            content = `
                <div class="flex justify-between items-center opacity-80 mb-1">
                    <span class="${userClass} text-blue-300">💬 ${log.data.nickname}</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="text-white/80">${log.data.message}</div>
            `;
            break;
        case 'response':
            content = `
                <div class="flex justify-between items-center opacity-80 mb-1">
                    <span class="${userClass} text-[#00d26a]">🤖 AI Assistant</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="text-white/90 italic">"${log.data.response}"</div>
            `;
            break;
        case 'gift':
            content = `
                <div class="flex justify-between items-center">
                    <span class="${userClass} text-yellow-400">🎁 ${log.data.nickname}</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="${msgClass}">Sent <span class="text-yellow-300 font-bold">${log.data.giftName}</span> x${log.data.giftCount}</div>
            `;
            break;
        case 'follow':
            content = `
                <div class="flex justify-between items-center">
                    <span class="${userClass} text-pink-400">❤️ ${log.data.nickname}</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="${msgClass}">Started following!</div>
            `;
            break;
        case 'status':
            content = `
                <div class="flex justify-between items-center">
                    <span class="${userClass} text-purple-400">📢 System</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="${msgClass}">${log.data.message}</div>
            `;
            break;
        case 'error':
            content = `
                <div class="flex justify-between items-center">
                    <span class="${userClass} text-red-400">❌ Error</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="${msgClass} text-red-200">${log.data.message}</div>
            `;
            break;
        case 'idle_audio':
            content = `
                <div class="flex justify-between items-center">
                    <span class="${userClass} text-cyan-400">🔊 Auto Audio</span>
                    <span class="text-xs text-white/30">${time}</span>
                </div>
                <div class="${msgClass} italic text-sm text-cyan-100/70">${log.data.message}</div>
            `;
            break;
        default:
            content = `<div class="${msgClass}">${JSON.stringify(log.data)}</div>`;
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
    if (sendDemo) {
        sendDemo.addEventListener('click', sendDemoMessage);
    }
    if (demoMessage) {
        demoMessage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendDemoMessage();
        });
    }

    // Save Settings
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // Save Products
    document.getElementById('saveProducts').addEventListener('click', saveProducts);

    // Add Product
    if (document.getElementById('addProduct')) {
        document.getElementById('addProduct').addEventListener('click', () => {
            addProductItem({});
        });
    }

    // Add Promo
    if (document.getElementById('addPromo')) {
        document.getElementById('addPromo').addEventListener('click', () => {
            addPromoItem({});
        });
    }

    // Filter toggle
    const filterEnabled = document.getElementById('filterEnabled');
    if (filterEnabled) {
        filterEnabled.addEventListener('change', (e) => {
            updateFilterStatusLabel(e.target.checked);
        });
    }

    // Toggle visibility for password fields
    document.querySelectorAll('.toggle-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);

            if (input.tagName === 'TEXTAREA') {
                const isHidden = !input.classList.contains('text-security-none');
                if (isHidden) {
                    input.classList.add('text-security-none');
                    input.style.webkitTextSecurity = 'none';
                    btn.textContent = '🙈';
                } else {
                    input.classList.remove('text-security-none');
                    input.style.webkitTextSecurity = 'disc';
                    btn.textContent = '👁️';
                }
            } else {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.textContent = isPassword ? '🙈' : '👁️';
            }
        });
    });

    // Manual input in dashboard
    const manualInput = document.getElementById('manualInput');
    if (manualInput) {
        manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = manualInput.value.trim();
                if (text) {
                    manualInput.value = '';
                    showToast('Manual reply sent (simulation)', 'success');
                }
            }
        });
    }
}

// Send Demo Message
async function sendDemoMessage() {
    if (!demoMessage) return;
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

        // Filter settings
        const filterEnabled = document.getElementById('filterEnabled');
        if (filterEnabled) {
            filterEnabled.checked = data.filterEnabled || false;
            updateFilterStatusLabel(data.filterEnabled);
        }
        document.getElementById('filterKeywords').value = data.filterKeywords || '';

    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

// Update Filter Status Label
function updateFilterStatusLabel(isEnabled) {
    const label = document.getElementById('filterStatusLabel');
    const options = document.getElementById('filterOptions');

    if (label) {
        label.textContent = isEnabled ? 'Active' : 'Disabled';
        if (isEnabled) {
            label.classList.add('text-purple-400');
            label.classList.remove('text-white/60');
        } else {
            label.classList.remove('text-purple-400');
            label.classList.add('text-white/60');
        }
    }

    if (options) {
        if (isEnabled) {
            options.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            options.classList.add('opacity-50', 'pointer-events-none');
        }
    }
}

// Save Settings
async function saveSettings() {
    const btn = document.getElementById('saveSettings');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const settings = {
        tiktokUsername: document.getElementById('tiktokUsername').value,
        groqApiKey: document.getElementById('groqApiKey').value,
        elevenlabsApiKey: document.getElementById('elevenlabsApiKey').value,
        voiceId: document.getElementById('voiceId').value,
        responseDelay: parseInt(document.getElementById('responseDelay').value),
        filterEnabled: document.getElementById('filterEnabled').checked,
        filterKeywords: document.getElementById('filterKeywords').value,
    };

    try {
        const res = await fetch(`${API_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
        const data = await res.json();
        if (data.success) {
            showToast('Configuration saved successfully!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Load Products
async function loadProducts() {
    try {
        const res = await fetch(`${API_URL}/api/products`);
        const data = await res.json();

        if (document.getElementById('storeName')) {
            document.getElementById('storeName').value = data.store_name || '';
        }

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
    item.className = 'product-item bg-white/5 border border-white/5 rounded-xl p-5 mb-4 group hover:border-white/10 transition-colors';
    item.innerHTML = `
        <div class="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
            <h4 class="font-medium text-white/90">Product #${index + 1}</h4>
            <button class="px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-xs transition-all border border-red-500/20 btn-remove">Delete</button>
        </div>
        <div class="space-y-4">
            <div class="space-y-1">
                <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Product Name</label>
                <input type="text" class="product-name w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500/50 outline-none transition-all placeholder-white/20" value="${product.name || ''}" placeholder="e.g., T-Shirt Black">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Price (Rp)</label>
                    <input type="number" class="product-price w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-green-500/50 outline-none transition-all placeholder-white/20" value="${product.price || ''}" placeholder="150000">
                </div>
                <div class="space-y-1">
                    <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Stock</label>
                    <input type="number" class="product-stock w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-orange-500/50 outline-none transition-all placeholder-white/20" value="${product.stock || ''}" placeholder="50">
                </div>
            </div>
            <div class="space-y-1">
                <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Description</label>
                <textarea class="product-description w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500/50 outline-none transition-all placeholder-white/20 min-h-[60px]" placeholder="Product details...">${product.description || ''}</textarea>
            </div>
            <div class="space-y-1 pt-2">
                <label class="text-xs text-white/50 ml-1 uppercase tracking-wider flex items-center gap-1">🎥 OBS Scene Source</label>
                <input type="text" class="product-obs-scene w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-purple-500/50 outline-none transition-all placeholder-white/20" value="${product.obs_scene || ''}" placeholder="e.g., Scene View 1">
            </div>
        </div>
    `;

    item.querySelector('.btn-remove').addEventListener('click', () => {
        item.remove();
    });

    productList.appendChild(item);
}

// Add Promo Item
function addPromoItem(promo) {
    const promoList = document.getElementById('promoList');

    const item = document.createElement('div');
    item.className = 'promo-item bg-[#00d26a]/5 border border-[#00d26a]/10 rounded-xl p-5 mb-4 hover:border-[#00d26a]/30 transition-colors';
    item.innerHTML = `
        <div class="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
            <h4 class="font-medium text-[#00d26a]">Active Promo</h4>
            <button class="px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-xs transition-all border border-red-500/20 btn-remove">Delete</button>
        </div>
        <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="col-span-2 space-y-1">
                <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Code</label>
                <input type="text" class="promo-code font-mono w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#00d26a]/50 outline-none transition-all text-[#00d26a]" value="${promo.code || ''}" placeholder="SALE50">
            </div>
            <div class="space-y-1">
                <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Disc %</label>
                <input type="number" class="promo-discount w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#00d26a]/50 outline-none transition-all" value="${promo.discount || ''}" placeholder="10">
            </div>
        </div>
        <div class="space-y-1">
            <label class="text-xs text-white/50 ml-1 uppercase tracking-wider">Description</label>
            <input type="text" class="promo-description w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#00d26a]/50 outline-none transition-all" value="${promo.description || ''}" placeholder="Promo details...">
        </div>
    `;

    item.querySelector('.btn-remove').addEventListener('click', () => {
        item.remove();
    });

    promoList.appendChild(item);
}

// Save Products
async function saveProducts() {
    const btn = document.getElementById('saveProducts');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const products = [];
    document.querySelectorAll('.product-item').forEach((item, index) => {
        products.push({
            id: index + 1,
            name: item.querySelector('.product-name').value,
            price: parseInt(item.querySelector('.product-price').value) || 0,
            description: item.querySelector('.product-description').value,
            stock: parseInt(item.querySelector('.product-stock').value) || 0,
            obs_scene: item.querySelector('.product-obs-scene')?.value || '',
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
            showToast('Catalog updated successfully!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');

    let baseClass = "fixed bottom-8 right-8 px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 transform transition-all duration-300 z-50";
    let typeClass = type === 'success'
        ? "bg-[#00d26a]/10 border-[#00d26a]/20 text-[#00d26a] backdrop-blur-md"
        : "bg-red-500/10 border-red-500/20 text-red-500 backdrop-blur-md";
    let icon = type === 'success' ? '✅' : '⚠️';

    toast.className = `${baseClass} ${typeClass}`;
    toast.innerHTML = `<span class="text-xl">${icon}</span> <span class="font-medium">${message}</span>`;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ ELEVENLABS USAGE GRAPH ============

// Store for usage history
let ttsUsageHistory = [];

// Update the ElevenLabs usage graph
function updateTTSUsageGraph(stats) {
    // Update text displays
    const sessionCharsEl = document.getElementById('sessionChars');
    const requestCountEl = document.getElementById('requestCount');
    const lastCharsEl = document.getElementById('lastChars');

    if (sessionCharsEl) sessionCharsEl.textContent = formatNumber(stats.sessionCharacters);
    if (requestCountEl) requestCountEl.textContent = stats.requestCount;
    if (lastCharsEl) lastCharsEl.textContent = stats.lastRequestChars;

    // Update stored history
    ttsUsageHistory = stats.history || [];

    // Render the graph
    renderUsageGraph();
}

// Render the usage bar graph
function renderUsageGraph() {
    const graphContainer = document.getElementById('usageGraph');
    if (!graphContainer) return;

    if (ttsUsageHistory.length === 0) {
        graphContainer.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white/20 text-xs">No usage data yet</div>';
        return;
    }

    // Find max value for scaling
    const maxChars = Math.max(...ttsUsageHistory.map(h => h.characters), 100);

    // Create bars (most recent first, so reverse)
    const reversedHistory = [...ttsUsageHistory].reverse();
    const barCount = 50; // Max bars to show
    const dataToShow = reversedHistory.slice(0, barCount);

    graphContainer.innerHTML = dataToShow.map((entry, index) => {
        const heightPercent = (entry.characters / maxChars) * 100;
        const isRecent = index < 3;

        // Color gradient based on character count
        let colorClass = 'bg-blue-500/60';
        if (entry.characters > 300) {
            colorClass = 'bg-[#ff2d55]'; // High usage - red
        } else if (entry.characters > 150) {
            colorClass = 'bg-[#00d26a]'; // Medium - green
        } else if (entry.characters > 50) {
            colorClass = 'bg-blue-500'; // Low - blue
        }

        // Add glow to recent bars
        const glowClass = isRecent ? 'shadow-[0_0_8px_rgba(0,210,106,0.5)]' : '';

        return `<div class="flex-1 min-w-[3px] max-w-[8px] ${colorClass} ${glowClass} rounded-t-sm transition-all duration-300" 
                     style="height: ${Math.max(heightPercent, 5)}%"
                     title="${entry.characters} chars"></div>`;
    }).join('');
}

// Load initial usage stats
async function loadTTSUsage() {
    try {
        const res = await fetch(`${API_URL}/api/tts/usage`);
        const stats = await res.json();
        updateTTSUsageGraph(stats);
    } catch (e) {
        console.error('Failed to load TTS usage:', e);
    }
}

// Initialize usage graph on load
document.addEventListener('DOMContentLoaded', () => {
    loadTTSUsage();
});

// ============ IDLE AUDIO ============

// Load Idle Audio Settings and Files
async function loadIdleAudio() {
    try {
        const settingsRes = await fetch(`${API_URL}/api/idle-audio/settings`);
        const settings = await settingsRes.json();

        const enabledCheckbox = document.getElementById('idleAudioEnabled');
        if (enabledCheckbox) enabledCheckbox.checked = settings.isEnabled;

        const intervalInput = document.getElementById('idleInterval');
        if (intervalInput) intervalInput.value = settings.intervalSeconds || 30;

        const playModeSelect = document.getElementById('idlePlayMode');
        if (playModeSelect) playModeSelect.value = settings.playMode || 'sequential';

        updateIdleStatusLabel(settings.isEnabled);
        await loadIdleAudioList();
    } catch (e) {
        console.error('Failed to load idle audio settings:', e);
    }
}

// Load Idle Audio List
async function loadIdleAudioList() {
    try {
        const res = await fetch(`${API_URL}/api/idle-audio`);
        const audioList = await res.json();
        renderIdleAudioList(audioList);
    } catch (e) {
        console.error('Failed to load audio list:', e);
    }
}

// Render Idle Audio List
function renderIdleAudioList(audioList) {
    const container = document.getElementById('idleAudioList');
    if (!container) return;

    if (!audioList || audioList.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-white/30 italic">No audio files uploaded yet.</div>';
        return;
    }

    container.innerHTML = audioList.map(audio => `
        <div class="flex items-center gap-4 bg-white/5 border border-white/5 rounded-xl p-4 transition-all hover:bg-white/10 group ${audio.is_active ? 'border-l-4 border-l-blue-500' : 'opacity-60 grayscale'}" data-id="${audio.id}">
            <div class="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
                <span class="text-xl">🎵</span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-medium text-white/90 truncate">${audio.original_name}</div>
                <div class="text-xs text-white/40 truncate">${audio.description || 'No description'}</div>
            </div>
            <div class="flex items-center gap-2">
                <button class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${audio.is_active
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            : 'bg-white/10 text-white/50 hover:bg-white/20'}"
                    onclick="toggleIdleAudio(${audio.id}, ${!audio.is_active})">
                    ${audio.is_active ? 'Active' : 'Inactive'}
                </button>
                <button class="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:bg-red-500/20 hover:text-red-500 transition-all" onclick="deleteIdleAudio(${audio.id})">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

// Update Idle Status Label
function updateIdleStatusLabel(isEnabled) {
    const label = document.getElementById('idleStatusLabel');
    if (label) {
        label.textContent = isEnabled ? 'Active' : 'Inactive';
        if (isEnabled) {
            label.classList.add('text-blue-400');
            label.classList.remove('text-white/40');
        } else {
            label.classList.remove('text-blue-400');
            label.classList.add('text-white/40');
        }
    }
}

// Setup Idle Audio Listeners
function setupIdleAudioListeners() {
    const enabledCheckbox = document.getElementById('idleAudioEnabled');
    const audioFile = document.getElementById('audioFile');
    const selectBtn = document.getElementById('selectAudioBtn');
    const uploadBtn = document.getElementById('uploadAudioBtn');
    const saveIdleBtn = document.getElementById('saveIdleSettings');

    if (!enabledCheckbox || !selectBtn || !uploadBtn || !saveIdleBtn) return;

    enabledCheckbox.addEventListener('change', () => {
        updateIdleStatusLabel(enabledCheckbox.checked);
    });

    selectBtn.addEventListener('click', () => {
        audioFile.click();
    });

    audioFile.addEventListener('change', () => {
        if (audioFile.files.length > 0) {
            selectBtn.textContent = `📂 ${audioFile.files[0].name}`;
            selectBtn.classList.add('bg-blue-500/20', 'text-blue-200');
            uploadBtn.disabled = false;
        } else {
            selectBtn.textContent = 'Select File';
            selectBtn.classList.remove('bg-blue-500/20', 'text-blue-200');
            uploadBtn.disabled = true;
        }
    });

    uploadBtn.addEventListener('click', uploadIdleAudio);
    saveIdleBtn.addEventListener('click', saveIdleAudioSettings);
}

// Upload Idle Audio
async function uploadIdleAudio() {
    const audioFile = document.getElementById('audioFile');
    const description = document.getElementById('audioDescription');
    const uploadBtn = document.getElementById('uploadAudioBtn');
    const selectBtn = document.getElementById('selectAudioBtn');

    if (!audioFile.files.length) {
        showToast('Please select an audio file first', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('audio', audioFile.files[0]);
    formData.append('description', description.value);

    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading...';

    try {
        const res = await fetch(`${API_URL}/api/idle-audio/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            showToast('Audio uploaded successfully!', 'success');
            audioFile.value = '';
            description.value = '';
            selectBtn.textContent = 'Select File';
            selectBtn.classList.remove('bg-blue-500/20', 'text-blue-200');
            await loadIdleAudioList();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Start Upload';
}

// Toggle Idle Audio Active Status
async function toggleIdleAudio(id, isActive) {
    try {
        const res = await fetch(`${API_URL}/api/idle-audio/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive ? 1 : 0 })
        });
        const data = await res.json();

        if (data.success) {
            await loadIdleAudioList();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Delete Idle Audio
async function deleteIdleAudio(id) {
    if (!confirm('Permanently delete this audio?')) return;

    try {
        const res = await fetch(`${API_URL}/api/idle-audio/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (data.success) {
            showToast('Audio deleted', 'success');
            await loadIdleAudioList();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Save Idle Audio Settings
async function saveIdleAudioSettings() {
    const btn = document.getElementById('saveIdleSettings');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const isEnabled = document.getElementById('idleAudioEnabled').checked;
    const intervalSeconds = parseInt(document.getElementById('idleInterval').value) || 30;
    const playMode = document.getElementById('idlePlayMode').value;

    try {
        const res = await fetch(`${API_URL}/api/idle-audio/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isEnabled, intervalSeconds, playMode })
        });
        const data = await res.json();

        if (data.success) {
            showToast('Idle settings saved!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
