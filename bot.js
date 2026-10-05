const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();
let qr = ''; let ready = false;

app.get('/', (req,res)=>res.send('Bot Live! روح على /qr'));
app.get('/qr', async (req,res)=>{
  if(ready) return res.send('<h1>CONNECTED ✅ خلص!</h1>');
  if(!qr) return res.send('<h1>عم يجهز... اعمل ريفريش بعد 20 ثانية</h1>');
  const img = await qrcode.toDataURL(qr);
  res.send(`<center><img src="${img}" width="350"><h2>صور بسرعة من واتساب!</h2><p>الـ QR بيخلص بعد 20 ثانية</p></center>`);
});

app.listen(process.env.PORT||10000, ()=>console.log('web ok'));

async function start(){
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: [...chromium.args,'--no-sandbox'], executablePath: await chromium.executablePath(), headless: true },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
  });
  client.on('qr', q=>{ qr=q; console.log('QR'); });
  client.on('ready', ()=>{ ready=true; console.log('READY'); });
  client.on('message', m=>{ if(m.body.toLowerCase()=='ping') m.reply('pong شغال! 🔥'); });
  await client.initialize();
}
start();
