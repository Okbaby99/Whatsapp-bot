const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const app = express();

let qrCodeData = null;
let sock = null;
let pairingCode = null;
const humanTakeover = new Map();

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));

app.get('/qr', async (req,res) => {
  if(!qrCodeData &&!sock) return res.send('بعده عم يبلش... اعمل Refresh بعد 10 ثواني');
  if(!qrCodeData && sock) return res.send('موصول already ✅ - اذا بدك تربط رقم جديد امسح auth واعمل deploy');

  let html = '';
  if(qrCodeData) {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    html += `<img src="${qrImage}" style="width:350px"><br>`;
  }
  html += `
    <h2>طريقتين للربط:</h2>
    <p>1- اعمل سكان للـ QR</p>
    <p>2- او حط رقمك هون:</p>
    <form action="/pair" method="get">
      <input name="number" placeholder="961xxxxxxxx" style="padding:10px;font-size:18px">
      <button style="padding:10px">جيب الكود</button>
    </form>
    ${pairingCode? `<h1 style="color:green;letter-spacing:5px">${pairingCode}</h1><p>فوت على واتساب > الاجهزة المرتبطة > ربط جهاز > ربط برقم الهاتف</p>` : ''}
  `;
  res.send(html);
});

app.get('/pair', async (req,res) => {
  try {
    let num = req.query.number.replace(/[^0-9]/g,'');
    if(!num) return res.redirect('/qr');
    pairingCode = await sock.requestPairingCode(num);
    console.log('PAIR CODE:', pairingCode);
    res.redirect('/qr');
  } catch(e) {
    res.send('Error: ' + e.message + ' - تأكد الرقم مع البلد متل 96176123456');
  }
});

async function askAI(text) {
  try {
    if(!process.env.GROQ_KEY) return 'هلا والله! شو بدك؟';
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'انت مساعد لبناني مهضوم بتحكي لبناني عامي قصير.' },
          { role: 'user', content: text }
        ]
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch(e) { return 'هلا يا قلبي كيف بقدر ساعدك؟'; }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if(u.qr) qrCodeData = u.qr;
    if(u.connection === 'open') { console.log('✅ Connected'); qrCodeData = null; pairingCode=null; }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for(const msg of messages) {
      if(!msg.message) continue;
      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      if(from.endsWith('@g.us')) continue;
      if(isFromMe) { humanTakeover.set(from, Date.now()); continue; }
      if(humanTakeover.has(from) && (Date.now() - humanTakeover.get(from))/60000 < 60) continue;
      else humanTakeover.delete(from);

      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if(msg.message.audioMessage || msg.message.pttMessage) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
          const blob = new Blob([buffer], { type: 'audio/ogg' });
          const formData = new FormData();
          formData.append('file', blob, 'voice.ogg');
          formData.append('model', 'whisper-large-v3');
          const res2 = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method:'POST', headers:{'Authorization':`Bearer ${process.env.GROQ_KEY}`}, body: formData });
          const data = await res2.json();
          text = data.text || '';
        } catch(e) {}
      }
      if(!text) continue;
      await new Promise(r => setTimeout(r, 10000));
      const reply = await askAI(text);
      await sock.sendMessage(from, { text: reply });
    }
  });
}
startBot();
app.listen(3000);
