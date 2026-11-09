/**
 * Bharadwaj Pally Unnayan Samity (BPUS)
 * 24/7 Cloud WhatsApp Bot for https://bpus.gt.tc/
 * 
 * Runs on Render.com (Free Web Service)
 * Provides a Web Dashboard for QR Code scanning and health checks,
 * while running WhatsApp Web in the background to sync group chanda/expenses directly to https://bpus.gt.tc/
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 1. Load Config
const configPath = path.join(__dirname, 'config.json');
let config = {
    liveApiUrl: "https://bpus.gt.tc/acc/api/whatsapp_webhook.php",
    apiSecret: "bpus_wa_secret_key_2026",
    targetGroupName: "",
    botPrefixes: ["/+", "+", "/-", "-", "?", "/balance", "/summary", "/events", "/help", "/menu", "chanda", "khoroch", "hisab"]
};

if (fs.existsSync(configPath)) {
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error("⚠️ Failed to read config.json, using defaults.");
    }
}

// 2. State Variables
let botStatus = 'initializing'; // 'initializing', 'qr_ready', 'authenticated', 'connected'
let latestQrRaw = null;
let latestQrImage = null;
let lastConnectedTime = null;
let logs = [];

function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    logs.unshift(line);
    if (logs.length > 50) logs.pop();
}

// 3. Express Web Server (Required for Render.com Web Service & QR Scanning)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    let qrHtml = '';
    let statusBadge = '';

    if (botStatus === 'connected') {
        statusBadge = '<span style="background: #10b981; color: #fff; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 0.9rem;">🟢 Connected &amp; Active</span>';
        qrHtml = `
            <div style="background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 14px; padding: 24px; margin: 20px 0; text-align: center;">
                <div style="font-size: 3rem; color: #10b981;">✅</div>
                <h3 style="color: #065f46; margin: 10px 0 6px;">WhatsApp Bot is Connected!</h3>
                <p style="color: #047857; margin: 0; font-size: 0.95rem;">
                    The bot is currently listening in your WhatsApp Group and syncing live to <strong>https://bpus.gt.tc/</strong>.
                </p>
                <div style="margin-top: 14px; font-size: 0.82rem; color: #64748b;">
                    Connected at: <strong>${lastConnectedTime || 'Just now'} (IST)</strong>
                </div>
            </div>
        `;
    } else if (botStatus === 'qr_ready' && latestQrImage) {
        statusBadge = '<span style="background: #f59e0b; color: #fff; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 0.9rem;">🟡 Waiting for Scan</span>';
        qrHtml = `
            <div style="background: #fffbeb; border: 2px solid #fde68a; border-radius: 14px; padding: 24px; margin: 20px 0; text-align: center;">
                <h3 style="color: #92400e; margin: 0 0 10px;">Scan QR Code to Connect WhatsApp</h3>
                <p style="color: #b45309; font-size: 0.9rem; margin-bottom: 16px;">
                    Open WhatsApp on your phone ➔ <strong>Settings (or ⋮) ➔ Linked Devices ➔ Link a Device</strong> and scan this code:
                </p>
                <img src="${latestQrImage}" alt="WhatsApp QR Code" style="width: 260px; height: 260px; border: 4px solid #fff; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.1); margin: 0 auto; display: block;" />
                <div style="font-size: 0.8rem; color: #78350f; margin-top: 12px;">
                    🔄 This page auto-refreshes every 15 seconds.
                </div>
            </div>
        `;
    } else {
        statusBadge = '<span style="background: #64748b; color: #fff; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 0.9rem;">⏳ Starting Engine...</span>';
        qrHtml = `
            <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 30px; margin: 20px 0; text-align: center; color: #475569;">
                <div style="font-size: 2rem; margin-bottom: 10px;">⏳</div>
                <h4 style="margin: 0 0 6px;">Initializing WhatsApp Client...</h4>
                <p style="margin: 0; font-size: 0.9rem;">Generating QR code, please wait a few seconds...</p>
            </div>
        `;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BPUS WhatsApp Bot Dashboard</title>
        <meta http-equiv="refresh" content="15">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Outfit', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px 16px; display: flex; justify-content: center; }
            .card { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; max-width: 620px; width: 100%; padding: 28px; box-shadow: 0 12px 36px rgba(0,0,0,0.4); }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; flex-wrap: wrap; gap: 10px; }
            h1 { font-size: 1.35rem; margin: 0; color: #fff; }
            .meta { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
            .cmd-box { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; margin-top: 20px; font-size: 0.85rem; line-height: 1.6; }
            .cmd-box code { background: rgba(255,255,255,0.1); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .log-box { background: #000; color: #10b981; font-family: monospace; font-size: 0.76rem; border-radius: 8px; padding: 12px; max-height: 160px; overflow-y: auto; margin-top: 18px; line-height: 1.4; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <div>
                    <h1>BPUS WhatsApp Bot</h1>
                    <div class="meta">Connected to <a href="${config.liveApiUrl}" target="_blank" style="color: #38bdf8; text-decoration: none;">https://bpus.gt.tc/</a></div>
                </div>
                <div>${statusBadge}</div>
            </div>

            ${qrHtml}

            <div class="cmd-box">
                <strong style="color: #fef08a;">💬 WhatsApp Group Commands:</strong><br>
                • <code>/+ Subhas Mondal 500</code> ➔ Record Chanda (Collection)<br>
                • <code>/- Sound Advance 2500</code> ➔ Record Expense (Khoroch)<br>
                • <code>?</code> or <code>/balance</code> ➔ View Current Accounts Balance<br>
                • <code>/events</code> ➔ View All Puja Festival Balances<br>
                • <code>/help</code> ➔ Show Command Guide
            </div>

            <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #94a3b8;">
                <span>Live Website: <a href="https://bpus.gt.tc/acc/" target="_blank" style="color: #38bdf8;">bpus.gt.tc/acc</a></span>
                <a href="/" style="color: #fff; text-decoration: none; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px;">🔄 Refresh Now</a>
            </div>

            <div class="log-box">
                ${logs.map(l => `<div>${l}</div>`).join('')}
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: botStatus,
        target: config.liveApiUrl,
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    addLog(`🌐 Web Dashboard & Healthcheck running on port ${PORT}`);
    addLog(`📡 Target API Endpoint: ${config.liveApiUrl}`);

    // Self keep-alive ping every 10 minutes to prevent Render Free tier from sleeping
    const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(() => {
        axios.get(`${selfUrl}/health`)
            .then(() => console.log(`💓 [Keep-Alive] Pinged ${selfUrl}/health successfully.`))
            .catch(() => {});
    }, 10 * 60 * 1000);
});

// 4. Resolve Chrome / Chromium Path
let chromeExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!chromeExecutable || !fs.existsSync(chromeExecutable)) {
    const candidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            chromeExecutable = c;
            break;
        }
    }
}
if (chromeExecutable) {
    addLog(`🔍 Using Browser binary: ${chromeExecutable}`);
}

// Initialize WhatsApp Web Client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: {
        headless: true,
        executablePath: chromeExecutable || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Event: QR Code
client.on('qr', async (qr) => {
    botStatus = 'qr_ready';
    latestQrRaw = qr;
    try {
        latestQrImage = await QRCode.toDataURL(qr);
    } catch (e) {}

    addLog("📱 New QR Code Generated! Scan from web dashboard or terminal.");
    qrcodeTerminal.generate(qr, { small: true });
});

// Event: Authenticated
client.on('authenticated', () => {
    botStatus = 'authenticated';
    addLog("✅ WhatsApp Client Authenticated Successfully!");
});

client.on('auth_failure', (msg) => {
    botStatus = 'auth_failed';
    addLog(`❌ WhatsApp Authentication Failed: ${msg}`);
});

// Event: Ready
client.on('ready', () => {
    botStatus = 'connected';
    lastConnectedTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    addLog("🚀 WhatsApp Bot is CONNECTED & LISTENING in Groups!");
});

// Event: Incoming Message
client.on('message', async (msg) => {
    try {
        if (!msg.body) return;

        const text = msg.body.trim();
        
        const isCommand = config.botPrefixes.some(prefix => {
            if (prefix.startsWith('/')) {
                return text.toLowerCase().startsWith(prefix.toLowerCase());
            } else {
                return text.startsWith(prefix);
            }
        });

        if (!isCommand) return;

        const chat = await msg.getChat();
        const contact = await msg.getContact();

        // Target group filter
        if (config.targetGroupName && config.targetGroupName.trim() !== '') {
            if (!chat.isGroup) return;
            if (!chat.name.toLowerCase().includes(config.targetGroupName.toLowerCase())) {
                return;
            }
        }

        const senderName = contact.pushname || contact.name || contact.number || "WhatsApp User";
        const groupName = chat.isGroup ? chat.name : "Direct Chat";

        addLog(`📩 Command received: "${text}" from ${senderName} in [${groupName}]`);

        // Send to Live Website Webhook
        const response = await axios.post(config.liveApiUrl, {
            token: config.apiSecret,
            message: text,
            sender: senderName,
            phone: contact.number || '',
            group: groupName
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-BPUS-Bot-Token': config.apiSecret
            },
            timeout: 15000
        });

        if (response.data && response.data.reply) {
            addLog(`📤 Delivering reply to group: ${response.data.status} (${response.data.type || 'info'})`);
            await msg.reply(response.data.reply);
            addLog("✅ WhatsApp reply successfully sent!");
        }

    } catch (err) {
        addLog(`❌ Webhook Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
        try {
            await msg.reply("⚠️ *ত্রুটি:* লাইভ ওয়েবসাইটের সাথে কানেক্ট করতে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
        } catch (e) {}
    }
});

// Start WhatsApp
client.initialize();

