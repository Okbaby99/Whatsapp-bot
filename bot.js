const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');

const app = express();
let qrCodeData = null;
let sock = null;
let pairingCode = null;

// الذاكرة
const humanTakeover = new Map();
const debounceTimers = new Map();
const messageBuffer = new Map();

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong'));

app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... اعمل Refresh بعد 5 ثواني');
  if(!qrCodeData) return res.send('<h1>موصول already ✅ CONNECTED</h1>');
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<center><img src="${qrImage}" style="width:350px"><br>
    <form action="/pair"><input name="number" placeholder="96176xxxxxx" style="padding:12px;font-size:18px">
    <button style="padding:12px">جيب الكود</button></form>
    ${pairingCode?`<h1 style="color:green;font-size:50px;letter-spacing:5px">${pairingCode}</h1>`:''}</center>`);
});

app.get('/pair', async (req,res) => {
  try {
    let num = req.query.number.replace(/[^0-9]/g,'');
    pairingCode = await sock.requestPairingCode(num);
    res.redirect('/qr');
  } catch(e){ res.send(e.message); }
});

// 1- يحول الفويس لنص - بلا اي باكج اضافي
async function transcribeVoice(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    console.log('🎤 نزل فويس', buffer.length);

    const form = new FormData();
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    form.append('file', blob, 'voice.ogg');
    form.append('model', 'whisper-large-v3');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}` },
      body: form
    });
    const data = await r.json();
    console.log('📝 الفويس:', data.text);
    return data.text || null;
  } catch(e){
    console.log('Voice err', e.message);
