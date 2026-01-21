import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_PATH = path.join(__dirname, '..', 'data', 'database.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        description TEXT,
        stock INTEGER DEFAULT 0,
        obs_scene TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Promotions table
    CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount REAL NOT NULL DEFAULT 0,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat logs table
    CREATE TABLE IF NOT EXISTS chat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Idle audio table
    CREATE TABLE IF NOT EXISTS idle_audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ============ SETTINGS ============

export function getSetting(key, defaultValue = null) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
    db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
}

export function getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => {
        settings[row.key] = row.value;
    });
    return settings;
}

// ============ PRODUCTS ============

export function getAllProducts() {
    return db.prepare('SELECT * FROM products ORDER BY id').all();
}

export function getProductById(id) {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

export function createProduct(product) {
    const stmt = db.prepare(`
        INSERT INTO products (name, price, description, stock, obs_scene)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        product.name,
        product.price || 0,
        product.description || '',
        product.stock || 0,
        product.obs_scene || ''
    );
    return result.lastInsertRowid;
}

export function updateProduct(id, product) {
    const stmt = db.prepare(`
        UPDATE products SET 
            name = ?, 
            price = ?, 
            description = ?, 
            stock = ?, 
            obs_scene = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);
    return stmt.run(
        product.name,
        product.price || 0,
        product.description || '',
        product.stock || 0,
        product.obs_scene || '',
        id
    );
}

export function deleteProduct(id) {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

// ============ PROMOTIONS ============

export function getAllPromotions() {
    return db.prepare('SELECT * FROM promotions ORDER BY id').all();
}

export function getPromotionByCode(code) {
    return db.prepare('SELECT * FROM promotions WHERE code = ? AND is_active = 1').get(code);
}

export function createPromotion(promo) {
    const stmt = db.prepare(`
        INSERT INTO promotions (code, discount, description)
        VALUES (?, ?, ?)
    `);
    const result = stmt.run(
        promo.code,
        promo.discount || 0,
        promo.description || ''
    );
    return result.lastInsertRowid;
}

export function updatePromotion(id, promo) {
    const stmt = db.prepare(`
        UPDATE promotions SET 
            code = ?, 
            discount = ?, 
            description = ?,
            is_active = ?
        WHERE id = ?
    `);
    return stmt.run(
        promo.code,
        promo.discount || 0,
        promo.description || '',
        promo.is_active !== undefined ? promo.is_active : 1,
        id
    );
}

export function deletePromotion(id) {
    return db.prepare('DELETE FROM promotions WHERE id = ?').run(id);
}

// ============ CHAT LOGS ============

export function addChatLog(type, data) {
    const stmt = db.prepare(`
        INSERT INTO chat_logs (type, data)
        VALUES (?, ?)
    `);
    return stmt.run(type, JSON.stringify(data));
}

export function getChatLogs(limit = 100) {
    const rows = db.prepare(`
        SELECT * FROM chat_logs 
        ORDER BY id DESC 
        LIMIT ?
    `).all(limit);

    return rows.map(row => ({
        id: row.id,
        type: row.type,
        data: JSON.parse(row.data || '{}'),
        timestamp: row.timestamp
    }));
}

export function clearChatLogs() {
    return db.prepare('DELETE FROM chat_logs').run();
}

// ============ IDLE AUDIO ============

export function getAllIdleAudio() {
    return db.prepare('SELECT * FROM idle_audio ORDER BY id').all();
}

export function getActiveIdleAudio() {
    return db.prepare('SELECT * FROM idle_audio WHERE is_active = 1 ORDER BY id').all();
}

export function createIdleAudio(audio) {
    const stmt = db.prepare(`
        INSERT INTO idle_audio (filename, original_name, description)
        VALUES (?, ?, ?)
    `);
    const result = stmt.run(
        audio.filename,
        audio.original_name || audio.filename,
        audio.description || ''
    );
    return result.lastInsertRowid;
}

export function updateIdleAudio(id, audio) {
    const stmt = db.prepare(`
        UPDATE idle_audio SET 
            description = ?,
            is_active = ?
        WHERE id = ?
    `);
    return stmt.run(
        audio.description || '',
        audio.is_active !== undefined ? audio.is_active : 1,
        id
    );
}

export function deleteIdleAudio(id) {
    return db.prepare('DELETE FROM idle_audio WHERE id = ?').run(id);
}

export function getIdleAudioById(id) {
    return db.prepare('SELECT * FROM idle_audio WHERE id = ?').get(id);
}

// ============ MIGRATION ============

export function migrateFromJSON(jsonPath) {
    try {
        if (!fs.existsSync(jsonPath)) {
            console.log('No JSON file to migrate');
            return false;
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        // Migrate store name
        if (data.store_name) {
            setSetting('store_name', data.store_name);
        }

        // Migrate products
        if (data.products && data.products.length > 0) {
            // Check if products table is empty
            const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
            if (count.count === 0) {
                const insertStmt = db.prepare(`
                    INSERT INTO products (name, price, description, stock, obs_scene)
                    VALUES (?, ?, ?, ?, ?)
                `);

                const insertMany = db.transaction((products) => {
                    for (const p of products) {
                        insertStmt.run(
                            p.name,
                            p.price || 0,
                            p.description || '',
                            p.stock || 0,
                            p.obs_scene || ''
                        );
                    }
                });

                insertMany(data.products);
                console.log(`Migrated ${data.products.length} products`);
            }
        }

        // Migrate promotions
        if (data.promotions && data.promotions.length > 0) {
            const count = db.prepare('SELECT COUNT(*) as count FROM promotions').get();
            if (count.count === 0) {
                const insertStmt = db.prepare(`
                    INSERT INTO promotions (code, discount, description)
                    VALUES (?, ?, ?)
                `);

                const insertMany = db.transaction((promotions) => {
                    for (const p of promotions) {
                        insertStmt.run(
                            p.code,
                            p.discount || 0,
                            p.description || ''
                        );
                    }
                });

                insertMany(data.promotions);
                console.log(`Migrated ${data.promotions.length} promotions`);
            }
        }

        // Rename old JSON file as backup
        const backupPath = jsonPath.replace('.json', '.backup.json');
        fs.renameSync(jsonPath, backupPath);
        console.log(`JSON backup saved to: ${backupPath}`);

        return true;
    } catch (error) {
        console.error('Migration error:', error);
        return false;
    }
}

// Export database instance for advanced queries
export { db };

// Cleanup on exit
process.on('exit', () => db.close());
process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});
