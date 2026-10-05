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
      console.log('QR ready - روح على /qr');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('✅ Bot Connected!');
      qrCodeData = null;
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    // هون بتحط اوامر البوت تبعك
    console.log('رسالة جديدة:', m.messages[0]?.message?.conversation);
  });
}

startBot();

// رابط الـ QR
app.get('/qr', async (req, res) => {
  if (!qrCodeData) {
    return res.send('<h2>البوت مربوط already او السيرفر بعده عم يحمل - جرب /pair</h2>');
  }
  try {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.send(`<img src="${qrImage}" style="width:300px"><br><h3>اعمل Scan بسرعة - معك 20 ثانية!</h3><script>setTimeout(()=>location.reload(), 20000)</script>`);
  } catch (e) {
    res.send('Error generating QR: ' + e.message);
  }
});

// رابط كود الرقم - مصلح 100%
app.get('/pair', async (req, res) => {
  try {
    let number = req.query.number;
    if (!number) return res.status(400).send('حط رقم:?number=9613782814');

    number = number.replace(/[^0-9]/g, '');

    if (!sock) return res.status(500).send('البوت بعده عم يحمل - جرب بعد دقيقة');

    // هيدا السطر المهم يلي كان ناقص!
    await new Promise(resolve => setTimeout(resolve, 2000));

    const code = await sock.requestPairingCode(number);
    res.send(`<h1 style="font-size:50px; letter-spacing:5px">${code}</h1><p>حط هيدا الكود بواتساب > ربط جهاز > ربط برقم الهاتف</p>`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error: ${err.message} - جرب بعد دقيقة`);
  }
});

app.get('/', (req, res) => {
  res.send('Bot is Live! روح على /qr او /pair?number=رقمك');
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
