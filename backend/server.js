require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');
const { registerGmailRoutes } = require('./gmailForward');

const app = express();
const PORT = 3001;

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json({ limit: '10mb' })); // limit lớn hơn để nhận ảnh base64
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(session({
    secret: 'subtrack-secret-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const requireAuth  = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Chưa đăng nhập' });
const requireAdmin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Cần quyền Admin' });

// ===== AUTH =====
function generateToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

async function sendVerifyEmail(toEmail, username, token, smtpSettings) {
    if (!smtpSettings || !smtpSettings.smtpHost || !smtpSettings.smtpUser || !smtpSettings.smtpPass) return false;
    try {
        const t = nodemailer.createTransport({
            host: smtpSettings.smtpHost,
            port: smtpSettings.smtpPort || 587,
            secure: smtpSettings.smtpPort == 465,
            auth: { user: smtpSettings.smtpUser, pass: smtpSettings.smtpPass }
        });
        const verifyUrl = `http://localhost:${PORT}/api/verify/${token}`;
        await t.sendMail({
            from: `"SubTrack" <${smtpSettings.smtpUser}>`,
            to: toEmail,
            subject: 'Xác thực tài khoản SubTrack',
            html: `
                <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;background:#0c0c0f;color:#ededf0;padding:32px;border-radius:16px">
                    <div style="text-align:center;margin-bottom:24px">
                        <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:#6366f1;color:#fff;font-size:18px;font-weight:800;line-height:40px">S</div>
                        <span style="font-size:20px;font-weight:800;margin-left:8px">Sub<span style="color:#6366f1">Track</span></span>
                    </div>
                    <h2 style="font-size:18px;font-weight:700;margin-bottom:8px">Xin chào ${username},</h2>
                    <p style="color:#a0a0ae;line-height:1.6;margin-bottom:24px">Cảm ơn bạn đã đăng ký tài khoản SubTrack. Vui lòng bấm nút bên dưới để xác thực email và kích hoạt tài khoản.</p>
                    <div style="text-align:center;margin-bottom:24px">
                        <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Xác thực tài khoản</a>
                    </div>
                    <p style="color:#5c5c6a;font-size:12px;line-height:1.5">Nếu nút không hoạt động, hãy copy link sau vào trình duyệt:<br><a href="${verifyUrl}" style="color:#6366f1;word-break:break-all">${verifyUrl}</a></p>
                    <hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:20px 0">
                    <p style="color:#5c5c6a;font-size:11px;text-align:center">Email này được gửi tự động từ hệ thống SubTrack. Nếu bạn không đăng ký, vui lòng bỏ qua.</p>
                </div>
            `
        });
        return true;
    } catch (e) {
        console.error('Send verify email error:', e.message);
        return false;
    }
}

app.post('/api/register', (req, res) => {
    const { username, password, email, phone } = req.body;
    if (!username || username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập tối thiểu 3 ký tự' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
    if (!phone || phone.replace(/\D/g,'').length < 9) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });

    db.get("SELECT id FROM users WHERE email = ?", [email], (err, existing) => {
        if (existing) return res.status(400).json({ error: 'Email này đã được sử dụng' });

        const token = generateToken();
        bcrypt.hash(password, 10, (err, hash) => {
            db.run("INSERT INTO users (username, password, role, email, phone, verified, verifyToken) VALUES (?, ?, 'client', ?, ?, 0, ?)",
                [username, hash, email, phone.replace(/\D/g,''), token], function(err) {
                    if (err) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
                    const userId = this.lastID;
                    // Auto-save email to user_contacts for notifications
                    db.run("INSERT OR REPLACE INTO user_contacts (user_id, email) VALUES (?, ?)", [userId, email]);
                    // Send verification email
                    db.get("SELECT * FROM system_settings WHERE id = 1", async (err, smtp) => {
                        const sent = await sendVerifyEmail(email, username, token, smtp);
                        res.json({ success: true, emailSent: sent, message: sent ? 'Đã gửi email xác thực. Vui lòng kiểm tra hộp thư.' : 'Đăng ký thành công nhưng chưa gửi được email. Liên hệ admin.' });
                    });
                }
            );
        });
    });
});

app.get('/api/verify/:token', (req, res) => {
    const { token } = req.params;
    if (!token) return res.status(400).send('Token không hợp lệ');
    db.get("SELECT * FROM users WHERE verifyToken = ?", [token], (err, user) => {
        if (!user) return res.send(`<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0c0c0f;color:#ededf0;font-family:Arial"><div style="text-align:center"><h1 style="color:#ef4444">Link không hợp lệ</h1><p style="color:#a0a0ae">Token đã hết hạn hoặc không tồn tại.</p><a href="/login.html" style="color:#6366f1">Quay lại đăng nhập</a></div></body></html>`);
        if (user.verified) return res.send(`<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0c0c0f;color:#ededf0;font-family:Arial"><div style="text-align:center"><h1 style="color:#22c55e">Đã xác thực</h1><p style="color:#a0a0ae">Tài khoản của bạn đã được kích hoạt trước đó.</p><a href="/login.html" style="color:#6366f1">Đăng nhập ngay</a></div></body></html>`);
        db.run("UPDATE users SET verified=1, verifyToken=NULL WHERE id=?", [user.id], () => {
            res.send(`<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0c0c0f;color:#ededf0;font-family:Arial"><div style="text-align:center"><div style="width:60px;height:60px;border-radius:50%;background:rgba(34,197,94,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><h1 style="color:#22c55e;margin-bottom:8px">Xác thực thành công!</h1><p style="color:#a0a0ae;margin-bottom:24px">Tài khoản <strong>${user.username}</strong> đã được kích hoạt.</p><a href="/login.html" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Đăng nhập ngay</a></div></body></html>`);
        });
    });
});

app.post('/api/resend-verify', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' });
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản với email này' });
        if (user.verified) return res.status(400).json({ error: 'Tài khoản đã được xác thực' });
        const token = generateToken();
        db.run("UPDATE users SET verifyToken=? WHERE id=?", [token, user.id], () => {
            db.get("SELECT * FROM system_settings WHERE id = 1", async (err, smtp) => {
                const sent = await sendVerifyEmail(email, user.username, token, smtp);
                res.json({ success: sent, message: sent ? 'Đã gửi lại email xác thực' : 'Không gửi được email. Liên hệ admin.' });
            });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const identifier = (username || '').trim();
    // Cho phép đăng nhập bằng username, email hoặc số điện thoại
    db.get(
        "SELECT * FROM users WHERE username = ? OR email = ? OR phone = ?",
        [identifier, identifier, identifier],
        (err, user) => {
            if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
            bcrypt.compare(password, user.password, (err, ok) => {
                if (!ok) return res.status(401).json({ error: 'Mật khẩu không đúng' });
                if (!user.verified && user.role !== 'admin') return res.status(403).json({ error: 'Tài khoản chưa được xác thực email. Vui lòng kiểm tra hộp thư.', needVerify: true, email: user.email });
                req.session.user = { id: user.id, username: user.username, role: user.role, tier: user.tier || 'free' };
                res.json({ success: true, user: req.session.user });
            });
        }
    );
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', (req, res) => req.session.user ? res.json({ user: req.session.user }) : res.status(401).json({ error: 'Chưa đăng nhập' }));

// ===== ADMIN SETTINGS =====
app.get('/api/admin/settings', requireAdmin, (req, res) => {
    db.get("SELECT * FROM system_settings WHERE id = 1", (err, row) => res.json(row || {}));
});
app.post('/api/admin/settings', requireAdmin, (req, res) => {
    const { tgToken, smtpHost, smtpPort, smtpUser, smtpPass, bank_name, bank_account, bank_receiver } = req.body;
    db.run("UPDATE system_settings SET tgToken=?, smtpHost=?, smtpPort=?, smtpUser=?, smtpPass=?, bank_name=?, bank_account=?, bank_receiver=? WHERE id=1",
        [tgToken, smtpHost, smtpPort, smtpUser, smtpPass, bank_name, bank_account, bank_receiver],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ success: true })
    );
});

// ===== USER CONTACTS =====
app.get('/api/user_contacts', requireAuth, (req, res) => {
    db.get("SELECT * FROM user_contacts WHERE user_id = ?", [req.session.user.id], (err, row) => res.json(row || {}));
});
app.post('/api/user_contacts', requireAuth, (req, res) => {
    const { tgChatId, email } = req.body;
    db.run("INSERT OR REPLACE INTO user_contacts (user_id, tgChatId, email) VALUES (?, ?, ?)",
        [req.session.user.id, tgChatId, email],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ success: true })
    );
});

// ===== SUBSCRIPTIONS =====
function logActivity(userId, username, action, detail) {
    db.run("INSERT INTO activity_log (user_id, username, action, detail) VALUES (?,?,?,?)", [userId, username, action, detail]);
}

app.get('/api/subscriptions', requireAuth, (req, res) => {
    db.all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY nextDate ASC", [req.session.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/subscriptions', requireAuth, (req, res) => {
    const { name, icon, accountEmail, price, billingCycle, cycleCount,
            startDate, nextDate, billingDay, members, isTrial, paymentMethod, category, notes, reminders } = req.body;
    db.get("SELECT COUNT(*) as cnt FROM subscriptions WHERE user_id=?", [req.session.user.id], (err, subData) => {
        const count = subData ? subData.cnt : 0;
        db.get("SELECT t.max_subs FROM users u LEFT JOIN tiers t ON u.tier = t.id WHERE u.id=?", [req.session.user.id], (err, tData) => {
            if (tData && count >= (tData.max_subs || 5)) {
                return res.status(403).json({ error: 'Quá giới hạn gói dịch vụ. Vui lòng nâng cấp tài khoản!', needUpgrade: true });
            }
            db.run(`INSERT INTO subscriptions
                    (user_id, name, icon, accountEmail, price, billingCycle, cycleCount,
                     startDate, nextDate, billingDay, members, isTrial, paymentMethod, category, notes, reminders)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.session.user.id, name, icon || '', accountEmail || '', price,
                 billingCycle || 'monthly', cycleCount || 1, startDate, nextDate, billingDay,
                 members || 1, isTrial ? 1 : 0, paymentMethod || '', category || 'other', notes || '', reminders || '3day,1day,5h,3h,1h'],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    logActivity(req.session.user.id, req.session.user.username, 'add_sub', `Thêm gói "${name}" - ${price}đ`);
                    res.json({ id: this.lastID });
                }
            );
        });
    });
});

app.patch('/api/subscriptions/:id', requireAuth, (req, res) => {
    const { name, icon, accountEmail, price, billingCycle, cycleCount,
            nextDate, members, isTrial, paymentMethod, category, notes, reminders } = req.body;
    // Track price change
    db.get("SELECT price,name FROM subscriptions WHERE id=? AND user_id=?", [req.params.id, req.session.user.id], (err, old) => {
        if (old && old.price != price) {
            db.run("INSERT INTO price_history (subscription_id, old_price, new_price) VALUES (?,?,?)", [req.params.id, old.price, price]);
            logActivity(req.session.user.id, req.session.user.username, 'price_change', `${old.name}: ${old.price}đ → ${price}đ`);
        }
        db.run(`UPDATE subscriptions SET
                name=?, icon=?, accountEmail=?, price=?, billingCycle=?, cycleCount=?,
                nextDate=?, members=?, isTrial=?, paymentMethod=?, category=?, notes=?, reminders=?
                WHERE id=? AND user_id=?`,
            [name, icon, accountEmail, price, billingCycle, cycleCount || 1, nextDate,
             members, isTrial ? 1 : 0, paymentMethod, category, notes, reminders || '3day,1day,5h,3h,1h',
             req.params.id, req.session.user.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                logActivity(req.session.user.id, req.session.user.username, 'edit_sub', `Sửa gói "${name}"`);
                res.json({ success: true });
            }
        );
    });
});

app.delete('/api/subscriptions/:id', requireAuth, (req, res) => {
    db.get("SELECT name FROM subscriptions WHERE id=? AND user_id=?", [req.params.id, req.session.user.id], (err, sub) => {
        db.run("DELETE FROM subscriptions WHERE id = ? AND user_id = ?", [req.params.id, req.session.user.id], () => {
            logActivity(req.session.user.id, req.session.user.username, 'delete_sub', `Xóa gói "${sub?.name||'?'}"`);
            res.json({ success: true });
        });
    });
});

// ===== NOTIFICATIONS & CRON =====
function nextDateFromServer(from, cycle) {
    const d = new Date(from);
    switch (cycle) {
        case 'weekly': d.setDate(d.getDate()+7); break;
        case 'quarterly': d.setMonth(d.getMonth()+3); break;
        case 'yearly': d.setFullYear(d.getFullYear()+1); break;
        default: d.setMonth(d.getMonth()+1);
    }
    return d;
}

app.get('/api/cron/process', (req, res) => {
    db.get("SELECT * FROM system_settings WHERE id = 1", (err, sys) => {
        if (!sys || (!sys.tgToken && !sys.smtpHost)) return res.json({ msg: 'No notification configured' });
        
        db.all("SELECT s.*, c.tgChatId, c.email FROM subscriptions s LEFT JOIN user_contacts c ON s.user_id = c.user_id", async (err, subs) => {
            if (!subs || subs.length === 0) return res.json({ msg: 'No subs' });
            
            let logs = [];
            const now = Date.now();
            
            for (const sub of subs) {
                if (!sub.tgChatId && !sub.email) continue;
                
                const nextUnix = new Date(sub.nextDate).getTime();
                
                // 1. Nếu quá hạn -> Auto renew
                if (nextUnix < now) {
                    let next = new Date(sub.nextDate);
                    let iterations = 0;
                    while (next.getTime() < now && iterations < 500) { next = nextDateFromServer(next, sub.billingCycle); iterations++; }
                    
                    const newNext = next.toISOString();
                    db.run("UPDATE subscriptions SET nextDate=?, notifiedReminders='{}' WHERE id=?", [newNext, sub.id]);
                    
                    const msg = `🔄 TỰ ĐỘNG GIA HẠN: Gói "${sub.name}" quá hạn và vừa được hệ thống dời lịch đến -> ${new Date(newNext).toLocaleDateString('vi-VN')}.`;
                    try { if (sys.tgToken && sub.tgChatId) await axios.post(`https://api.telegram.org/bot${sys.tgToken}/sendMessage`, { chat_id: sub.tgChatId, text: msg }); } catch {}
                    
                    logs.push(`Renewed ${sub.name}`);
                    continue;
                }
                
                // 2. Nếu chưa quá hạn -> Check reminders
                const diffHours = (nextUnix - now) / 3600000;
                const rems = (sub.reminders || '').split(',');
                let notified = {};
                try { notified = JSON.parse(sub.notifiedReminders || '{}'); } catch {}
                if (!notified[sub.nextDate]) notified[sub.nextDate] = [];
                
                const thresholds = { '7day': 7*24, '5day': 5*24, '3day': 3*24, '1day': 24, '5h': 5, '3h': 3, '2h': 2, '1h': 1 };
                
                let toTrigger = null;
                for (const r of rems) {
                    const th = thresholds[r];
                    if (th && diffHours <= th && !notified[sub.nextDate].includes(r)) {
                        toTrigger = r; break; // Chỉ gửi 1 mức kề nhất
                    }
                }
                
                if (toTrigger) {
                    const msg = `🔔 NHẮC TRƯỚC HẾT HẠN: Gói "${sub.name}" (giá ${sub.price}đ) sẽ cần thanh toán trong vòng ${toTrigger.replace('day',' ngày').replace('h',' giờ')} tới (${new Date(sub.nextDate).toLocaleDateString('vi-VN')}).`;
                    try { if (sys.tgToken && sub.tgChatId) await axios.post(`https://api.telegram.org/bot${sys.tgToken}/sendMessage`, { chat_id: sub.tgChatId, text: msg }); } catch {}
                    
                    notified[sub.nextDate].push(toTrigger);
                    db.run("UPDATE subscriptions SET notifiedReminders=? WHERE id=?", [JSON.stringify(notified), sub.id]);
                    logs.push(`Reminded ${sub.name} for ${toTrigger}`);
                }
            }
            res.json({ processed: subs.length, logs });
        });
    });
});

app.post('/api/notify', requireAuth, (req, res) => {
    const { subscriptionId, type } = req.body;
    db.get("SELECT * FROM subscriptions WHERE id = ? AND user_id = ?", [subscriptionId, req.session.user.id], (err, sub) => {
        if (!sub) return res.status(404).json({ error: 'Không tìm thấy gói' });
        db.get("SELECT * FROM system_settings WHERE id = 1", (err, sys) => {
            if (!sys) return res.status(400).json({ error: 'Lỗi cấu hình hệ thống' });
            db.get("SELECT * FROM user_contacts WHERE user_id = ?", [req.session.user.id], async (err, contacts) => {
                if (!contacts || (!contacts.tgChatId && !contacts.email))
                    return res.status(400).json({ error: 'Chưa cấu hình địa chỉ nhận thông báo' });

                const message = type === 'auto-renew'
                    ? `🔄 TỰ ĐỘNG GIA HẠN: Gói "${sub.name}" quá hạn và đã được hệ thống tự động dời ngày lịch biểu đến -> ${new Date(sub.nextDate).toLocaleDateString('vi-VN')}.`
                    : `⚠️ SẮP HẾT HẠN: Gói "${sub.name}" sắp đến hạn thanh toán/hết hạn vào lịch báo khoảng: ${new Date(sub.nextDate).toLocaleDateString('vi-VN')}.`;
                let results = [];

                if (sys.tgToken && contacts.tgChatId) {
                    try {
                        await axios.post(`https://api.telegram.org/bot${sys.tgToken}/sendMessage`,
                            { chat_id: contacts.tgChatId, text: message });
                        results.push('✅ Telegram');
                    } catch { results.push('❌ Telegram'); }
                }

                if (sys.smtpHost && sys.smtpUser && sys.smtpPass && contacts.email) {
                    try {
                        const t = nodemailer.createTransport({
                            host: sys.smtpHost, port: sys.smtpPort || 587,
                            secure: sys.smtpPort == 465,
                            auth: { user: sys.smtpUser, pass: sys.smtpPass }
                        });
                        await t.sendMail({
                            from: `"SubTrack" <${sys.smtpUser}>`,
                            to: contacts.email,
                            subject: `⚠️ ${sub.name} sắp hết hạn`,
                            text: message
                        });
                        results.push('✅ Email');
                    } catch { results.push('❌ Email'); }
                }

                db.run("UPDATE subscriptions SET lastNotifiedCycle=? WHERE id=?", [sub.nextDate, sub.id]);
                res.json({ results });
            });
        });
    });
});

// ===== ADMIN USERS =====
app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all("SELECT id, username, role FROM users", (err, rows) => res.json(rows || []));
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const stats = {};
    db.get("SELECT COUNT(*) as total FROM users", (e, r) => { stats.totalUsers = r?.total || 0;
    db.get("SELECT COUNT(*) as total FROM users WHERE role='admin'", (e, r) => { stats.admins = r?.total || 0;
    db.get("SELECT COUNT(*) as total FROM subscriptions", (e, r) => { stats.totalSubs = r?.total || 0;
    db.get("SELECT SUM(price) as total FROM subscriptions", (e, r) => { stats.totalRevenue = r?.total || 0;
    db.all("SELECT category, COUNT(*) as cnt, SUM(price) as total FROM subscriptions GROUP BY category", (e, rows) => { stats.byCategory = rows || [];
    db.all("SELECT u.username, COUNT(s.id) as subCount, SUM(s.price) as totalSpend FROM users u LEFT JOIN subscriptions s ON u.id=s.user_id GROUP BY u.id ORDER BY totalSpend DESC", (e, rows) => { stats.userBreakdown = rows || [];
    db.all("SELECT billingCycle, COUNT(*) as cnt FROM subscriptions GROUP BY billingCycle", (e, rows) => { stats.byCycle = rows || [];
    db.get("SELECT * FROM system_settings WHERE id = 1", (e, r) => { stats.settings = r || {};
        res.json(stats);
    })})})})})})})});
});

app.get('/api/admin/users/:id/subs', requireAdmin, (req, res) => {
    db.all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY nextDate ASC", [req.params.id], (err, rows) => res.json(rows || []));
});

app.patch('/api/admin/users/:id/role', requireAdmin, (req, res) => {
    const { role } = req.body;
    if (!['admin','client'].includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
    db.run("UPDATE users SET role=? WHERE id=?", [role, req.params.id], err => err ? res.status(500).json({ error: err.message }) : res.json({ success: true }));
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const uid = req.params.id;
    if (uid == req.session.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
    db.run("DELETE FROM subscriptions WHERE user_id=?", [uid], () => {
        db.run("DELETE FROM user_contacts WHERE user_id=?", [uid], () => {
            db.run("DELETE FROM users WHERE id=?", [uid], err => err ? res.status(500).json({error: err.message}) : res.json({success:true}));
        });
    });
});

app.get('/api/admin/all-subs', requireAdmin, (req, res) => {
    db.all("SELECT s.*, u.username FROM subscriptions s JOIN users u ON s.user_id=u.id ORDER BY s.nextDate ASC", (err, rows) => res.json(rows || []));
});

// ===== ACTIVITY LOG =====
app.get('/api/activity', requireAuth, (req, res) => {
    db.all("SELECT * FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT 50", [req.session.user.id], (err, rows) => res.json(rows || []));
});
app.get('/api/admin/activity', requireAdmin, (req, res) => {
    db.all("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100", (err, rows) => res.json(rows || []));
});

// ===== CHANGE PASSWORD =====
app.post('/api/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
    db.get("SELECT password FROM users WHERE id=?", [req.session.user.id], (err, user) => {
        if (!user) return res.status(404).json({ error: 'User not found' });
        bcrypt.compare(currentPassword, user.password, (err, ok) => {
            if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
            bcrypt.hash(newPassword, 10, (err, hash) => {
                db.run("UPDATE users SET password=? WHERE id=?", [hash, req.session.user.id], () => {
                    logActivity(req.session.user.id, req.session.user.username, 'change_password', 'Đổi mật khẩu');
                    res.json({ success: true });
                });
            });
        });
    });
});

// ===== PROFILE & TIERS =====
app.get('/api/profile', requireAuth, (req, res) => {
    db.get("SELECT u.id, u.username, u.email, u.phone, u.role, u.verified, u.tier, t.name as tierName, t.max_subs, t.features FROM users u LEFT JOIN tiers t ON u.tier = t.id WHERE u.id=?", [req.session.user.id], (err, user) => {
        if (user && user.features) {
            try { user.features = JSON.parse(user.features); } catch(e) { user.features = []; }
        }
        res.json(user || {});
    });
});
app.patch('/api/profile', requireAuth, (req, res) => {
    const { email, phone } = req.body;
    db.run("UPDATE users SET email=?, phone=? WHERE id=?", [email, phone, req.session.user.id], err => {
        if (err) return res.status(500).json({ error: err.message });
        if (email) db.run("INSERT INTO user_contacts (user_id, email) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email", [req.session.user.id, email]);
        logActivity(req.session.user.id, req.session.user.username, 'update_profile', 'Cập nhật thông tin cá nhân');
        res.json({ success: true });
    });
});

app.post('/api/test-upgrade', requireAuth, (req, res) => {
    const { tier } = req.body;
    db.run("UPDATE users SET tier=? WHERE id=?", [tier, req.session.user.id], () => {
        if(req.session.user) req.session.user.tier = tier;
        res.json({ success: true, tier });
    });
});

app.get('/api/admin/tiers', requireAuth, (req, res) => {
    db.all("SELECT * FROM tiers", (err, rows) => {
        if(rows) rows.forEach(r => { try { r.features = JSON.parse(r.features); } catch(e){ r.features = []; } });
        res.json(rows || []);
    });
});
app.patch('/api/admin/tiers/:id', requireAdmin, (req, res) => {
    const { name, max_subs, features, price } = req.body;
    db.run("UPDATE tiers SET name=?, max_subs=?, features=?, price=? WHERE id=?", [name, max_subs, JSON.stringify(features||[]), price||0, req.params.id], err => {
        res.json({ success: !err, error: err?.message });
    });
});
// ===== CHECKOUT & UPGRADE REQUESTS =====
app.get('/api/admin/public-settings', (req, res) => {
    db.get("SELECT bank_name, bank_account, bank_receiver FROM system_settings WHERE id = 1", (err, row) => res.json(row || {}));
});
app.get('/api/upgrade-requests', requireAuth, (req, res) => {
    db.get("SELECT * FROM upgrade_requests WHERE user_id=? AND status='pending'", [req.session.user.id], (err, row) => res.json(row||null));
});
app.post('/api/checkout', requireAuth, (req, res) => {
    const { target_tier, amount } = req.body;
    db.run("INSERT INTO upgrade_requests (user_id, target_tier, amount) VALUES (?, ?, ?)", [req.session.user.id, target_tier, amount], err => {
        if(err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});
app.get('/api/admin/upgrade-requests', requireAdmin, (req, res) => {
    db.all("SELECT r.*, u.username FROM upgrade_requests r JOIN users u ON r.user_id = u.id WHERE r.status='pending' ORDER BY r.created_at DESC", (err, rows) => res.json(rows || []));
});
app.post('/api/admin/upgrade-requests/:id/approve', requireAdmin, (req, res) => {
    db.get("SELECT * FROM upgrade_requests WHERE id=?", [req.params.id], (err, reqData) => {
        if(!reqData || reqData.status !== 'pending') return res.status(404).json({error: 'Request not found or resolved'});
        db.run("UPDATE upgrade_requests SET status='approved' WHERE id=?", [req.params.id], () => {
            db.run("UPDATE users SET tier=? WHERE id=?", [reqData.target_tier, reqData.user_id], () => {
                logActivity(reqData.user_id, 'System', 'upgrade_approved', `Gói được nâng cấp lên ${reqData.target_tier}`);
                res.json({success: true});
            });
        });
    });
});
app.post('/api/admin/upgrade-requests/:id/reject', requireAdmin, (req, res) => {
    db.run("UPDATE upgrade_requests SET status='rejected' WHERE id=?", [req.params.id], (err) => res.json({success: !err}));
});

// ===== PRICE HISTORY =====
app.get('/api/subscriptions/:id/price-history', requireAuth, (req, res) => {
    db.all("SELECT * FROM price_history WHERE subscription_id=? ORDER BY changed_at DESC LIMIT 20", [req.params.id], (err, rows) => res.json(rows || []));
});

// ===== PAID STREAK =====
app.post('/api/subscriptions/:id/checkin', requireAuth, (req, res) => {
    db.get("SELECT * FROM subscriptions WHERE id=? AND user_id=?", [req.params.id, req.session.user.id], (err, sub) => {
        if (!sub) return res.status(404).json({ error: 'Not found' });
        const newStreak = (sub.paidStreak || 0) + 1;
        db.run("UPDATE subscriptions SET paidStreak=? WHERE id=?", [newStreak, sub.id], () => {
            logActivity(req.session.user.id, req.session.user.username, 'checkin', `Check-in "${sub.name}" — streak ${newStreak}`);
            res.json({ success: true, streak: newStreak });
        });
    });
});

// ===== GMAIL FORWARDING ROUTES =====
registerGmailRoutes(app, requireAuth);

app.listen(PORT, () => console.log(`🚀 SubTrack running → http://localhost:${PORT}`));

