const { webcrypto } = require('crypto');
if (!global.crypto) {
  global.crypto = webcrypto;
}

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 10000;

let qrCodeData = null;
let sock = null;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Chrome", "Linux", ""],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrCodeData = qr;
      console.log('QR READY');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('BOT CONNECTED!');
      qrCodeData = null;
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    console.log('رسالة جديدة');
  });
}

startBot();

app.get('/qr', async (req, res) => {
  if (!qrCodeData) return res.send('<h2>QR خلص وقتو - فوت على /pair?number=رقمك</h2>');
  try {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.send(`<div style="text-align:center"><img src="${qrImage}" style="width:300px"><br><h3>اعمل Scan بسرعة!</h3></div><script>setTimeout(()=>location.reload(), 20000)</script>`);
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

app.get('/pair', async (req, res) => {
  try {
    let number = req.query.number;
    if (!number) return res.status(400).send('حط رقمك هيك: ?number=9613782814');
    number = number.replace(/[^0-9]/g, '');
    if (!sock) return res.send('البوت بعده عم يحمل - جرب بعد 10 ثواني');
    
    await new Promise(r => setTimeout(r, 3000));
    const code = await sock.requestPairingCode(number);
    res.send(`<div style="text-align:center; margin-top:100px"><h1 style="font-size:60px; letter-spacing:8px">${code}</h1><p>واتساب > الأجهزة المرتبطة > ربط جهاز > ربط برقم الهاتف</p></div>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error: ' + err.message + ' - جرب بعد دقيقة');
  }
});

app.get('/', (req, res) => res.send('Bot Live! /qr or /pair?number=رقمك'));
app.listen(PORT, () => console.log('Server on ' + PORT));
