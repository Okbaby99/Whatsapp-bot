const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();
let qr = ''; let ready = false; let client;

app.get('/', (req,res)=>res.send('Live! /qr للـ QR /pair?number=961XXXXXXXX'));

app.get('/qr', async (req,res)=>{
  if(ready) return res.send('<h1>CONNECTED ✅</h1>');
  if(!qr) return res.send('انتظر 15 ثانية واعمل ريفريش');
  const img = await qrcode.toDataURL(qr);
  res.send(`<center><img src="${img}" width="300"><p>صور بسرعة! بيخلص بعد 20 ثانية</p></center>`);
});

// هيدي الطريقة الجديدة
app.get('/pair', async (req,res)=>{
  const number = req.query.number;
  if(!number) return res.send('حط رقمك هيك: /pair?number=96170000000 مع رمز البلد بدون +');
  if(!client) return res.send('انتظر شوي بعدو عم يركب');
  try{
    const code = await client.requestPairingCode(number.replace(/[^0-9]/g,''));
    res.send(`<h1>الكود تبعك: ${code}</h1><p>فوت واتساب > الاجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف > حط هيدا الكود</p><p>${code}</p>`);
  }catch(e){ res.send('غلط: '+e.message); }
});

app.listen(process.env.PORT||10000, ()=>console.log('web ok'));

async function start(){
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'], 
      executablePath: await chromium.executablePath(), 
      headless: true 
    }
  });
  client.on('qr', q=>{ qr=q; console.log('qr'); });
  client.on('ready', ()=>{ ready=true; console.log('ready'); });
  client.on('message', m=>{ if(m.body.toLowerCase()=='ping') m.reply('pong شغال! 🔥'); });
  await client.initialize();
}
start();
