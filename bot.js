const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const FormData = require('form-data');

const app = express();
let qrCodeData = null;
let sock = null;
let pairingCode = null;

// ذاكرة البوت
const humanTakeover = new Map();
const debounceTimers = new Map();
const messageBuffer = new Map();

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong'));

app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... Refresh بعد 5 ثواني');
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

// يحول الفويس لنص
async function transcribeVoice(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const tempPath = `/tmp/${Date.now()}.ogg`;
    fs.writeFileSync(tempPath, buffer);
    const form = new FormData();
    form.append('file', fs.createReadStream(tempPath));
    form.append('model', 'whisper-large-v3');
    form.append('language', 'auto');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}`,...form.getHeaders() },
      body: form
    });
    const data = await r.json();
    fs.unlinkSync(tempPath);
    console.log('🎤 فويس:', data.text);
    return data.text || null;
  } catch(e) { console.log('Voice err', e.message); return null; }
}

// العقل - بيفهم كلشي
async function askAI(text) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.GROQ_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'llama-3.1-8b-instant',
        messages:[
          {
            role:'system',
            content: `انت شاب لبناني اسمك عبود، بترد على واتساب.
            قواعد ذهبية:
            1- رد بنفس لغة الزبون 100%. اذا حكى عربي لبناني عامي رد لبناني عامي. اذا حكى انجليزي رد انجليزي. اذا حكى فرنسي رد فرنسي. اذا خربط عربي وانجليزي رد متلو.
            2- لغة الواتساب مقدسة: اذا قال "كيفك يا برو - مشتقلك - wlak - chou - kifak bro - habibi - ya zalame" رد بنفس الجو: "هلا يا برو والله مشتقلك اكتر" - خليك طبيعي كأنك رفيقو.
            3- اذا بعت شي بلغة غريبة عليك، ترجمو بعقلك وافهمو ورد عليه بلغتو هو.
            4- لا تقل ابدا انك ذكاء اصطناعي. انت انسان.
            5- ردودك قصيرة، مهضومة، بلا رسمية. استعمل ايموجي واحد بالكتير.
            6- اذا حدا سألك شو بتبيع، قلو انا بساعد صاحب الرقم بالردود.`
          },
          {role:'user', content: text}
        ],
        temperature: 0.85
      })
    });
    const d = await r.json();
    return d.choices[0].message.content;
  } catch(e){ console.log('AI err', e.message); return null; }
}

async function startBot(){
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({
    version, auth: state, printQRInTerminal:false,
    browser:['Ubuntu','Chrome','20.0.04'],
    syncFullHistory:false, markOnlineOnConnect:false,
    getMessage: async () => undefined
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    const { connection, lastDisconnect, qr } = u;
    if(qr){ qrCodeData = qr; console.log('QR READY'); }
    if(connection === 'open'){ console.log('✅ CONNECTED'); qrCodeData=null; }
    if(connection === 'close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      if(code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    for(const msg of messages){
      if(!msg.message) continue;
      const from = msg.key.remoteJid;
      if(from.endsWith('@g.us')) continue;

      // 1- اذا انت رديت بايدك -> سكّت البوت 10 دقايق
      if(msg.key.fromMe){
        humanTakeover.set(from, Date.now());
        console.log('👤 انت حكيت -> سكت 10د');
        continue;
      }

      // 2- شوف اذا بعدك حاكي من اقل من 10 دقايق
      const last = humanTakeover.get(from);
      if(last){
        const mins = (Date.now()-last)/60000;
        if(mins < 10){
          console.log(`⏸️ ساكت ${mins.toFixed(1)}د - انت بعدك هون`);
          continue;
        } else {
          console.log('✅ مرق 10د - البوت رجع');
          humanTakeover.delete(from);
        }
      }

      // 3- جيب النص
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
      if(!text && (msg.message.audioMessage || msg.message.pttMessage)){
        text = await transcribeVoice(msg);
        if(!text){
          await sock.sendMessage(from, {text: 'ما سمعت الفويس منيح حبيب فيك تكتبلي؟ 🎤'});
          continue;
        }
      }
      if(!text) continue;

      // 4- نظام التجميع - ينطر 10 ثواني
      const old = messageBuffer.get(from) || '';
      messageBuffer.set(from, old? old + '\n' + text : text);
      if(debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));

      console.log(`⏳ ناطر 10 ثواني من ${from}...`);

      const timer = setTimeout(async () => {
        const fullText = messageBuffer.get(from);
        messageBuffer.delete(from);
        debounceTimers.delete(from);

        console.log(`📩 رح رد على ${from}: ${fullText}`);

        // يبين انو عم يقرا ويكتب متل الانسان
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r=>setTimeout(r, 2000 + Math.random()*3000));

        const reply = await askAI(fullText);
        if(reply){
          await sock.sendPresenceUpdate('paused', from);
          await sock.sendMessage(from, {text: reply});
        }
      }, 10000); // 10 ثواني

      debounceTimers.set(from, timer);
    }
  });
}

startBot();
app.listen(3000, ()=>console.log('running 3000'));
setInterval(()=>{ const h=process.env.RENDER_EXTERNAL_HOSTNAME; if(h) fetch('https://'+h+'/ping').catch(()=>{}); }, 240000);
