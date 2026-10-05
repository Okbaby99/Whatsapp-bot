const express = require('express');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

let latestQR = null;
let sockStarted = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Bot", "Chrome", "1.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update;
        if (qr) {
            console.log('QR Generated');
            latestQR = await QRCode.toDataURL(qr);
        }
        if (connection === 'open') {
            console.log('Connected');
            latestQR = null;
        }
        if (connection === 'close') {
            latestQR = null;
            setTimeout(startBot, 5000);
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sockStarted = true;
}

startBot();

app.get('/', (req, res) => {
    res.send('<h1>Bot Live</h1><a href="/qr">فوت عال QR</a> | <a href="/clear">امسح الجلسة</a>');
});

app.get('/qr', (req, res) => {
    if (!latestQR) {
        return res.send(`
        <html><body style="background:black;color:white;text-align:center;padding-top:50px;font-family:sans-serif">
        <h2>عم يولد الـ QR... انطر 10 ثواني</h2>
        <p>الصفحة بتعمل تحديث لحالها - خليك فاتحها</p>
        <script>setTimeout(()=>location.reload(),5000)</script>
        </body></html>`);
    }
    res.send(`
    <html><body style="background:black;color:white;text-align:center;padding-top:20px">
    <h2>امسح هيدا الـ QR</h2>
    <img src="${latestQR}" style="width:320px;height:320px;background:white;padding:10px" />
    <p>واتساب > الاجهزة المرتبطة > ربط جهاز</p>
    <script>setTimeout(()=>location.reload(),25000)</script
