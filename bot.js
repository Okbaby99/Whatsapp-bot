const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const app = express();

let qrCodeData = null;
let sock = null;
const humanTakeover = new Map();

app.get('/', (req,res) => res.send('✅ شغال - ذكي + فويس + Human 90 دقيقة'));
app.get('/qr', async (req,res) => {
  if(!qrCodeData) return res.send('موصول already - ما في QR');
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<img src="${qrImage}" style="width:300px"><br><h2>اعمل سكان من واتساب > الاجهزة المرتبطة</h2>`);
});

async function askAI(text) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'انت مساعد لبناني مهضوم، بتحكي لبناني عامي قصير وطبيعي. بتجاوب على اي سؤال: ثقافة، اكل، بلدان، اي شي. اذا حكى انجليزي رد انجليزي.' },
          { role: 'user', content: text }
        ]
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch(e) { return 'هلا يا قلبي كيف بقدر ساعدك؟'; }
}

async function transcribeVoice(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    const formData = new FormData();
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'whisper-large-v3');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}` },
      body: formData
    });
    const data = await res.json();
    return data.text;
  } catch(e) { console.log('voice error', e); return null; }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if(u.qr) qrCodeData = u.qr;
    if(u.connection === 'open') { console.log('✅ Connected'); qrCodeData = null; }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for(const msg of messages) {
      if(!msg.message) continue;
      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      if(from.endsWith('@g.us')) continue;

      if(isFromMe) { humanTakeover.set(from, Date.now()); continue; }

      if(humanTakeover.has(from)) {
        if((Date.now() - humanTakeover.get(from)) / 60000 < 90) continue;
        else humanTakeover.delete(from);
      }

      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      // اذا فويس
      if(msg.message.audioMessage || msg.message.pttMessage) {
        console.log('جاي فويس...');
        const transcribed = await transcribeVoice(msg);
        if(!transcribed) continue;
        text = transcribed;
        console.log(`الفويس بيقول: ${text}`);
      }

      if(!text) continue;

      console.log(`رح رد على ${from}: ${text}`);
      await new Promise(r => setTimeout(r, 10000));
      const reply = await askAI(text);
      await sock.sendMessage(from, { text: reply });
    }
  });
}

startBot();
app.listen(3000, () => console.log('Server 3000'));
