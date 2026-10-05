const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const app = express();
let qrCodeData = null;
let sock = null;
let pairingCode = null;
const humanTakeover = new Map();
const debounceTimers = new Map();
const messageBuffer = new Map();
let ownerLastActive = Date.now();

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong'));
app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... اعمل Refresh بعد 5 ثواني');
  if(!qrCodeData) return res.send('<h1>✅ CONNECTED<br>Smart Mode شغال 🧠</h1>');
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<center><img src="${qrImage}" style="width:350px"><br><form action="/pair"><input name="number" placeholder="96176xxxxxx" style="padding:12px;font-size:18px"><button style="padding:12px">جيب الكود</button></form>${pairingCode?`<h1 style="color:green;font-size:50px;letter-spacing:5px">${pairingCode}</h1>`:''}</center>`);
});
app.get('/pair', async (req,res) => {
  try {
    let num = req.query.number.replace(/[^0-9]/g,'');
    pairingCode = await sock.requestPairingCode(num);
    res.redirect('/qr');
  } catch(e){ res.send(e.message); }
});

async function transcribeVoice(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const form = new FormData();
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    form.append('file', blob, 'voice.ogg');
    form.append('model', 'whisper-large-v3');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}` }, body: form });
    const data = await r.json();
    return data.text || null;
  } catch(e){ return null; }
}

async function askAI(text) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.GROQ_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'llama-3.1-8b-instant',
        messages:[ { role:'system', content: `انت شاب لبناني اسمو عبود، دمك خفيف، بترد عالواتساب عن صاحب الرقم. رد بنفس لغة الزبون 100%. لبناني = لبناني عامي. انجليزي = انجليزي. مهضوم، قصير، مش رسمي، لا تقول انك بوت.` }, {role:'user', content: text} ],
        temperature: 0.9
      })
    });
    const d = await r.json();
    return d.choices[0].message.content;
  } catch(e){ return null; }
}

async function startBot(){
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ version, auth: state, printQRInTerminal:false, logger: pino({ level: 'silent' }), browser:['Ubuntu','Chrome','20.0.04'], syncFullHistory:false, markOnlineOnConnect:false, getMessage: async () => undefined });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    const { connection, lastDisconnect, qr } = u;
    if(qr){ qrCodeData = qr; }
    if(connection === 'open'){ console.log('✅ CONNECTED - Smart Mode ON'); qrCodeData=null; ownerLastActive = Date.now(); }
    if(connection === 'close'){ const code = lastDisconnect?.error?.output?.statusCode; if(code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000); }
  });
  sock.ev.on('messages.upsert', async ({messages})=>{
    for(const msg of messages){
      try {
        if(!msg.message) continue;
        const from = msg.key.remoteJid;
        if(from.endsWith('@g.us')) continue;
        if(msg.key.fromMe){ ownerLastActive = Date.now(); humanTakeover.set(from, Date.now()); continue; }
        if((Date.now() - ownerLastActive)/60000 < 10) continue;
        const last = humanTakeover.get(from);
        if(last && (Date.now()-last)/60000 < 10) continue; else if(last) humanTakeover.delete(from);
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        if(!text && (msg.message.audioMessage || msg.message.pttMessage)){ text = await transcribeVoice(msg); if(!text) continue; }
        if(!text) continue;
        const old = messageBuffer.get(from) || '';
        messageBuffer.set(from, old? old + '\n' + text : text);
        if(debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
        const timer = setTimeout(async () => {
          const fullText = messageBuffer.get(from); messageBuffer.delete(from); debounceTimers.delete(from);
          if((Date.now() - ownerLastActive)/60000 < 10) return;
          await sock.sendPresenceUpdate('composing', from);
          await new Promise(r=>setTimeout(r, 2000));
          const reply = await askAI(fullText);
          if(reply){ await sock.sendPresenceUpdate('paused', from); await sock.sendMessage(from, {text: reply}); }
        }, 10000);
        debounceTimers.set(from, timer);
      } catch(e){}
    }
  });
}
startBot();
app.listen(3000, ()=>console.log('running 3000'));
setInterval(()=>{ const h=process.env.RENDER_EXTERNAL_HOSTNAME; if(h) fetch('https://'+h+'/ping').catch(()=>{}); }, 240000);
