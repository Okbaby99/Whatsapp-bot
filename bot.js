const { Client, LocalAuth, RemoteWebCache } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();

let qr = ''; let ready = false; let client;

app.get('/', (req,res)=>res.send('Live! /qr or /pair?number=961XXXXXXXX'));
app.get('/qr', async (req,res)=>{
  if(ready) return res.send('<h1>CONNECTED ✅</h1>');
  if(!qr) return res.send('انتظر 20 ثانية واعمل ريفريش...');
  const img = await qrcode.toDataURL(qr);
  res.send(`<center><img src="${img}" width="300"><h3>صور بسرعة!</h3></center>`);
});

app.get('/pair', async (req,res)=>{
  const number = req.query.number;
  if(!number) return res.send('استخدم: /pair?number=96170123456');
  if(!client) return res.send('بعدو عم يحمل...');
  try{
    const clean = number.replace(/[^0-9]/g,'');
    const code = await client.requestPairingCode(clean);
    res.send(`<center><h1 style="font-size:40px;letter-spacing:5px">${code}</h1><p>واتساب > الاجهزة المرتبطة > ربط جهاز > ربط برقم الهاتف > حط الكود</p></center>`);
  }catch(e){ res.send('Error: '+e.message+'<br>جرب /qr'); }
});

app.listen(process.env.PORT||10000, ()=>console.log('web ok'));

async function start(){
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
      args: [...chromium.args,'--no-sandbox','--disable-setuid-sandbox','--disable-gpu'], 
      executablePath: await chromium.executablePath(), 
      headless: true 
    },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
  });
  client.on('qr', q=>{ qr=q; console.log('QR READY'); });
  client.on('ready', ()=>{ ready=true; console.log('CONNECTED'); });
  client.on('message', async m=>{
    if(m.body.toLowerCase()=='ping') m.reply('pong شغال! 🔥');
  });
  await client.initialize();
}
start();
