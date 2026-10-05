const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const app = express();

let qrCodeData = null;
let sock = null;
let pairingCode = null;

app.get('/', (req,res) => res.send('✅ شغال - فوت على /qr'));
app.get('/ping', (req,res) => res.send('pong'));

app.get('/qr', async (req,res) => {
  if(!sock) return res.send('عم يبلش... اعمل Refresh');
  if(!qrCodeData) return res.send('موصول already ✅ CONNECTED');
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<img src="${qrImage}" style="width:350px"><br>
    <form action="/pair"><input name="number" placeholder="96176xxxxxx" style="padding:10px;font-size:20px">
    <button>جيب الكود</button></form>
    ${pairingCode?`<h1 style="color:green;font-size:40px">${pairingCode}</h1>`:''}`);
});

app.get('/pair', async (req,res) => {
  try {
    let num = req.query.number.replace(/[^0-9]/g,'');
    pairingCode = await sock.requestPairingCode(num);
    res.redirect('/qr');
  } catch(e){ res.send(e.message); }
});

async function askAI(text){
  try{
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.GROQ_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'llama-3.1-8b-instant',messages:[{role:'system',content:'انت مساعد لبناني مهضوم مختصر.'},{role:'user',content:text}]})
    });
    const d = await r.json();
    return d.choices[0].message.content;
  }catch{ return 'هلا كيف بقدر ساعدك؟'; }
}

async function startBot(){
  try{
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu','Chrome','20.0.04'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => { return undefined; }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u)=>{
      const { connection, lastDisconnect, qr } = u;
      if(qr){ qrCodeData = qr; console.log('QR READY'); }
      if(connection === 'open'){ console.log('✅ CONNECTED'); qrCodeData=null; }
      if(connection === 'close'){
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('Closed code:', code);
        if(code!== DisconnectReason.loggedOut){
          console.log('Reconnecting in 3s...');
          setTimeout(startBot, 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({messages})=>{
      for(const msg of messages){
        if(!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) continue;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if(!text) continue;
        await new Promise(r=>setTimeout(r,8000));
        const reply = await askAI(text);
        await sock.sendMessage(msg.key.remoteJid,{text:reply});
      }
    });

  }catch(e){
    console.log('Error in startBot:', e.message, ' - retrying in 5s');
    setTimeout(startBot, 5000);
  }
}

startBot();
app.listen(3000, ()=>console.log('running'));

// مشان ما ينام
setInterval(()=>{
  const host = process.env.RENDER_EXTERNAL_HOSTNAME;
  if(host) fetch('https://'+host+'/ping').catch(()=>{});
}, 240000);

// ما يكرش لو صار error
process.on('uncaughtException', (e)=>{ console.log('uncaught', e.message); });
process.on('unhandledRejection', (e)=>{ console.log('unhandled', e?.message); });
