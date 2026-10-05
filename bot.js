const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();
let qr = ''; let ready = false; let client;

app.get('/', (req,res)=>res.send('Bot Live! <a href="/qr">/qr</a> | <a href="/pair">/pair</a>'));
app.get('/qr', async (req,res)=>{
  if(ready) return res.send('<h1>CONNECTED ✅</h1>');
  if(!qr) return res.send('عم يجهز... نطر 30 ثانية واعمل ريفريش');
  const img = await qrcode.toDataURL(qr);
  res.send(`<center><img src="${img}" width="350"><h3>صور بسرعة!</h3></center>`);
});

app.get('/pair', async (req,res)=>{
  const number = req.query.number; // حط رقمك مع رمز البلد
  if(!number) return res.send('حط رقمك بالرابط هيك: /pair?number=9617XXXXXXX');
  try {
    const code = await client.requestPairingCode(number.replace('+','').replace(/ /g,''));
    res.send(`<h1>الكود تبعك: ${code}</h1><p>روح على واتساب > Link with phone number instead > حط هيدا الكود</p><h2>${code.match(/.{1,4}/g).join('-')}</h2>`);
  } catch(e){ res.send('Error: '+e.message+' - جرب بعد دقيقة'); }
});

app.listen(process.env.PORT||10000);

async function start(){
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: { args: [...chromium.args,'--no-sandbox','--disable-setuid-sandbox'], executablePath: await chromium.executablePath(), headless: true },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1015901307.html' }
  });
  client.on('qr', q=>{ qr=q; console.log('QR ready'); });
  client.on('ready', ()=>{ ready=true; console.log('READY'); });
  client.on('message', m=>{ if(m.body.toLowerCase()=='ping') m.reply('pong شغال! 🔥'); });
  await client.initialize();
}
start();
