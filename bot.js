const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
let qr = ''; 
let ready = false; 
let client;

app.get('/', (req,res)=>res.send('Bot Live! <a href="/qr">/qr</a> | <a href="/pair">/pair</a> | DB: ' + (mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Connecting...')));
app.get('/qr', async (req,res)=>{
  if(ready) return res.send('<h1>CONNECTED ✅</h1>');
  if(!qr) return res.send('عم يجهز... نطر 30 ثانية واعمل ريفريش');
  const img = await qrcode.toDataURL(qr);
  res.send(`<center><img src="${img}" width="350"><h3>صور بسرعة!</h3></center>`);
});

app.get('/pair', async (req,res)=>{
  const number = req.query.number;
  if(!number) return res.send('حط رقمك بالرابط هيك: /pair?number=9617XXXXXXX');
  try {
    const code = await client.requestPairingCode(number.replace('+','').replace(/ /g,''));
    res.send(`<h1>الكود تبعك: ${code}</h1><p>واتساب > Linked devices > Link with phone number > حط الكود</p><h2>${code.match(/.{1,4}/g).join('-')}</h2>`);
  } catch(e){ res.send('Error: '+e.message+' - جرب بعد دقيقة'); }
});

app.listen(process.env.PORT||10000, ()=>console.log('Express live'));

async function start(){
  // 1- اتصل بـ MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB Connected!');

  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  
  // 2- استخدم MongoStore بدل LocalAuth
  const store = new MongoStore({ mongoose: mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({ 
      store: store,
      backupSyncIntervalMs: 300000 
    }),
    puppeteer: { 
      args: [...chromium.args,'--no-sandbox','--disable-setuid-sandbox'], 
      executablePath: await chromium.executablePath(), 
      headless: true 
    },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015901307.html' }
  });

  client.on('qr', q=>{ qr=q; console.log('QR ready - روح على /qr'); });
  client.on('ready', ()=>{ ready=true; console.log('READY ✅ Bot is ready!'); });
  client.on('remote_session_saved', ()=>{ console.log('Session saved to MongoDB!'); });
  client.on('message', m=>{ if(m.body.toLowerCase()=='ping') m.reply('pong شغال! 🔥'); });
  
  await client.initialize();
}
start().catch(e=>console.error('START ERROR:', e));
