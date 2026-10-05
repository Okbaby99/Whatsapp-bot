const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const app = express();

let qrCodeData = null;
let sock = null;
let pairingCode = null;
const humanTakeover = new Map();

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong')); // مشان ما ينام

app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... اعمل Refresh بعد 10 ثواني');
  if(!qrCodeData) return res.send('موصول already ✅');
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`
    <img src="${qrImage}" style="width:350px"><br>
    <h3>او حط رقمك لتحصل كود:</h3>
    <form action="/pair">
      <input name="number" placeholder="96176xxxxxx" style="padding:10px;font-size:20px">
      <button style="padding:10px">جيب الكود</button>
    </form>
    ${pairingCode? `<h1 style="color:green;font-size:40px;letter-spacing:8px">${pairingCode}</h1>` : ''}
  `);
});

app.get('/pair', async (req,res) => {
  try {
    let num = req.query.number.replace(/[^0-9]/g,'');
    if(!num ||!sock) return res.redirect('/qr');
    pairingCode = await sock.requestPairingCode(num);
    res.redirect('/qr');
  } catch(e) { res.send('Error: '+e.message); }
});

async function askAI(text) {
  try {
    if(!process.env.GROQ_KEY) return 'هلا والله شو بدك؟';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.GROQ_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'llama-3.1-8b-instant',messages:[{role:'system',content:'انت مساعد لبناني مهضوم بتحكي لبناني قصير.'},{role:'user',content:text}]})
    });
    const d = await r.json();
    return d.choices[0].message.content;
  } catch(e){ return 'هلا يا قلبي كيف بساعدك؟'; }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal:false, browser:['Bot','Chrome','1.0'] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if(qr) { qrCodeData = qr; pairingCode=null; console.log('QR ready'); }
    if(connection === 'open') { console.log('✅ CONNECTED'); qrCodeData=null; }

    // هون الحل لـ Error 515
    if(connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if(shouldReconnect) {
        setTimeout(startBot, 3000); // بيرجع بيشتغل بعد 3 ثواني
      } else {
        console.log('Logged out - need new QR');
        qrCodeData = null;
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for(const msg of messages) {
      if(!msg.message) continue;
      const from = msg.key.remoteJid;
      if(from.endsWith('@g.us')) continue;
      if(msg.key.fromMe) { humanTakeover.set(from, Date.now()); continue; }
      if(humanTakeover.has(from) && (Date.now()-humanTakeover.get(from))/60000 < 60) continue;

      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if(!text) continue;
      await new Promise(r=>setTimeout(r,10000));
      const reply = await askAI(text);
      await sock.sendMessage(from,{text:reply});
    }
  });
}

startBot();
app.listen(3000, () => console.log('3000 running'));

// بيوعي حالو كل 4 دقايق مشان Render ما ينيمو
setInterval(()=>{ fetch('https://'+process.env.RENDER_EXTERNAL_HOSTNAME+'/ping').catch(()=>{}) }, 240000);
