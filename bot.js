const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');

const app = express();
let qrCodeData = null;
let sock = null;
let pairingCode = null;

const humanTakeover = new Map();
const debounceTimers = new Map();
const messageBuffer = new Map();

// هون بنحفظ امتين انت اخر مرة كنت ناشط
let ownerLastActive = Date.now();
let ownerJid = null;

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong'));

app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... اعمل Refresh بعد 5 ثواني');
  if(!qrCodeData) return res.send('<h1>موصول already ✅ CONNECTED<br><small>Smart Online Mode شغال 🧠</small></h1>');
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

async function transcribeVoice(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
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
    return data.text || null;
  } catch(e){ console.log('Voice err', e.message); return null; }
}

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
            content: `انت شاب لبناني اسمو عبود، دمك خفيف، بترد عالواتساب عن صاحب الرقم.
            1- رد بنفس لغة الزبون 100%. لبناني = لبناني عامي. انجليزي = انجليزي. wlak kifak bro = رد بنفس جو الانترنت.
            2- مهضوم، بتنكت، بتمزح، بس ذكي. اذا فتح معك اي موضوع جاوبو بطريقة ذكية كأنك انت صاحبو.
            3- لا تقول انك بوت ابدا.
            4- ردودك قصيرة ومش رسمية.`
          },
          {role:'user', content: text}
        ],
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
  sock = makeWASocket({
    version, auth: state, printQRInTerminal:false,
    browser:['Ubuntu','Chrome','20.0.04'],
    syncFullHistory:false, markOnlineOnConnect:false,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (u)=>{
    const { connection, lastDisconnect, qr } = u;
    if(qr){ qrCodeData = qr; }
    if(connection === 'open'){ 
      console.log('✅ CONNECTED - Smart Mode ON');
      qrCodeData=null; 
      ownerJid = sock.user.id;
      console.log('Owner JID:', ownerJid);
      ownerLastActive = Date.now();
    }
    if(connection === 'close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      if(code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
    }
  });

  // هون السر - كل ما انت تعمل اي شي، منعتبرك اونلاين
  sock.ev.on('messages.upsert', async ({messages})=>{
    for(const msg of messages){
      if(!msg.message) continue;
      const from = msg.key.remoteJid;
      if(from.endsWith('@g.us')) continue;

      // اذا انت بعت رسالة -> انت اونلاين هلق!
      if(msg.key.fromMe){
        ownerLastActive = Date.now();
        humanTakeover.set(from, Date.now());
        console.log('👤 انت نشط - حدثنا الوقت:', new Date().toLocaleTimeString());
        continue;
      }

      // --- نظام الـ Smart Online ---
      const timeSinceActive = (Date.now() - ownerLastActive) / 60000; // بالدقايق
      console.log(`⏱️ انت صرلك ${timeSinceActive.toFixed(1)} دقايق اوفلاين`);

      // اذا انت صرلك اقل من 10 دقايق اونلاين -> البوت ما بيرد
      if(timeSinceActive < 10){
        console.log(`😴 انت بعدك اونلاين (${timeSinceActive.toFixed(1)}د) -> البوت ساكت`);
        // بس اذا هيدا الشخص انت رديت عليه بايدك، منسجلها كمان
        const lastHuman = humanTakeover.get(from);
        if(lastHuman && (Date.now()-lastHuman)/60000 < 10){
          console.log('⏸️ كمان في takeover خاص لهيدا الشخص');
        }
        continue;
      }

      // اذا انت اوفلاين اكتر من 10 دقايق -> البوت بيشتغل
      // بس منشيك كمان الـ takeover الخاص
      const last = humanTakeover.get(from);
      if(last && (Date.now()-last)/60000 < 10){
        console.log(`⏸️ ساكت 10د لهيدا الشخص تحديدا`);
        continue;
      } else if(last){
        humanTakeover.delete(from);
      }

      // جيب النص
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
      
      if(!text && (msg.message.audioMessage || msg.message.pttMessage)){
        text = await transcribeVoice(msg);
        if(!text){
          // حتى لو انت اوفلاين، ما منرد عالفويس اذا ما فهمناه لن ما نكون اونلاين
          if(timeSinceActive >= 10){
            await sock.sendMessage(from, {text: 'ما سمعت الفويس منيح حبيب فيك تكتبلي؟ 🎤'});
          }
          continue;
        }
      }
      if(!text) continue;

      const old = messageBuffer.get(from) || '';
      messageBuffer.set(from, old ? old + '\n' + text : text);
      if(debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));

      console.log(`⏳ ناطر 10 ثواني... (انت اوفلاين من ${timeSinceActive.toFixed(1)}د)`);

      const timer = setTimeout(async () => {
        const fullText = messageBuffer.get(from);
        messageBuffer.delete(from);
        debounceTimers.delete(from);
        
        // شيك اخير قبل ما ترد - يمكن انت فتت بهالـ 10 ثواني!
        const finalCheck = (Date.now() - ownerLastActive) / 60000;
        if(finalCheck < 10){
          console.log(`🚫 لغينا الرد - انت رجعت اونلاين بآخر لحظة!`);
          return;
        }

        console.log(`📩 رح رد على ${from}: ${fullText}`);
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r=>setTimeout(r, 2000 + Math.random()*2000));
        const reply = await askAI(fullText);
        if(reply){
          await sock.sendPresenceUpdate('paused', from);
          await sock.sendMessage(from, {text: reply});
        }
      }, 10000);

      debounceTimers.set(from, timer);
    }
  });

  // كمان اذا قريت رسايل (blue ticks) منعتبرك اونلاين
  sock.ev.on('messages.update', (updates)=>{
    for(const u of updates){
      if(u.update.status === 3 || u.update.status === 4){ // read / played
        ownerLastActive = Date.now();
        console.log('👀 قريت رسالة -> انت اونلاين');
      }
    }
  });
}

startBot();
app.listen(3000, ()=>console.log('running 3000'));
setInterval(()=>{ const h=process.env.RENDER_EXTERNAL_HOSTNAME; if(h) fetch('https://'+h+'/ping').catch(()=>{}); }, 240000);
