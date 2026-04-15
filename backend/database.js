const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.resolve(__dirname, 'subscriptions.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'client',
        email TEXT,
        phone TEXT,
        verified INTEGER DEFAULT 0,
        verifyToken TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        tgToken TEXT, smtpHost TEXT,
        smtpPort INTEGER DEFAULT 587,
        smtpUser TEXT, smtpPass TEXT
    )`);
    db.run(`INSERT OR IGNORE INTO system_settings (id) VALUES (1)`);

    db.run(`CREATE TABLE IF NOT EXISTS user_contacts (
        user_id INTEGER PRIMARY KEY,
        tgChatId TEXT, email TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '📦',
        accountEmail TEXT,
        price REAL NOT NULL,
        billingCycle TEXT DEFAULT 'monthly',
        cycleCount INTEGER DEFAULT 1,
        startDate TEXT NOT NULL,
        nextDate TEXT NOT NULL,
        billingDay INTEGER NOT NULL,
        members INTEGER DEFAULT 1,
        isTrial INTEGER DEFAULT 0,
        paymentMethod TEXT DEFAULT '',
        category TEXT DEFAULT 'other',
        notes TEXT DEFAULT '',
        lastNotifiedCycle TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER,
        old_price REAL,
        new_price REAL,
        changed_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        max_subs INTEGER DEFAULT 5,
        features TEXT
    )`);

    db.run(`INSERT OR IGNORE INTO tiers (id, name, max_subs, features) VALUES 
        ('free', 'Free', 5, '[]'),
        ('pro', 'Pro', 20, '["analytics","calendar","ocr"]'),
        ('ultra', 'Ultra', 9999, '["analytics","calendar","ocr","export","priority"]')
    `);

    db.run(`CREATE TABLE IF NOT EXISTS upgrade_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        target_tier TEXT,
        amount REAL,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    const migrations = [
        "ALTER TABLE subscriptions ADD COLUMN icon TEXT DEFAULT '📦'",
        "ALTER TABLE subscriptions ADD COLUMN accountEmail TEXT",
        "ALTER TABLE subscriptions ADD COLUMN billingCycle TEXT DEFAULT 'monthly'",
        "ALTER TABLE subscriptions ADD COLUMN cycleCount INTEGER DEFAULT 1",
        "ALTER TABLE subscriptions ADD COLUMN paymentMethod TEXT DEFAULT ''",
        "ALTER TABLE subscriptions ADD COLUMN category TEXT DEFAULT 'other'",
        "ALTER TABLE subscriptions ADD COLUMN notes TEXT DEFAULT ''",
        "ALTER TABLE subscriptions ADD COLUMN reminders TEXT DEFAULT '3day,1day,5h,3h,1h'",
        "ALTER TABLE subscriptions ADD COLUMN notifiedReminders TEXT DEFAULT '{}'",
        "ALTER TABLE users ADD COLUMN email TEXT",
        "ALTER TABLE users ADD COLUMN phone TEXT",
        "ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN verifyToken TEXT",
        "ALTER TABLE subscriptions ADD COLUMN paidStreak INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'",
        "ALTER TABLE system_settings ADD COLUMN bank_name TEXT DEFAULT ''",
        "ALTER TABLE system_settings ADD COLUMN bank_account TEXT DEFAULT ''",
        "ALTER TABLE system_settings ADD COLUMN bank_receiver TEXT DEFAULT ''",
        "ALTER TABLE tiers ADD COLUMN price REAL DEFAULT 0"
    ];
    migrations.forEach(sql => db.run(sql, () => {}));

    // Admin mặc định
    db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                db.run("INSERT INTO users (username, password, role, verified, tier) VALUES ('admin', ?, 'admin', 1, 'ultra')", [hash]);
                console.log("✅ Admin mặc định: admin / admin123");
            });
        } else {
            db.run("UPDATE users SET verified=1, tier='ultra' WHERE username='admin'");
        }
    });
});

module.exports = db;
