const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
let qrCode = '';
let isReady = false;

app.get('/', (req,res) => res.send('Bot is Live - go to /qr'));
app.get('/qr', async (req,res) => {
  if(isReady) return res.send('<h1 style="text-align:center">✅ CONNECTED - خلص!</h1>');
  if(!qrCode) return res.send('<h1>⏳ نطر 10 ثواني واعمل Refresh</h1>');
  try{
    const img = await qrcode.toDataURL(qrCode);
    res.send(`<div style="text-align:center"><h2>اعمل Scan</h2><img src="${img}" style="width:300px"><p>من واتساب > Linked Devices</p></div>`);
  }catch(e){ res.send('Error: '+e.message); }
});

app.listen(process.env.PORT || 10000, () => console.log('Web server live'));

async function startBot(){
  try{
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    const execPath = await chromium.executablePath();
    
    const client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: chromium.args,
        executablePath: execPath,
        headless: chromium.headless
      }
    });

    client.on('qr', q => { qrCode = q; console.log('QR READY'); });
    client.on('ready', () => { isReady = true; console.log('CLIENT READY'); });
    client.on('message', async msg => {
      if(msg.body.toLowerCase() === 'ping') msg.reply('pong ✅ البوت شغال!');
    });

    await client.initialize();
    console.log('Bot initialized');
  }catch(e){
    console.error('Bot error:', e.message);
  }
}

startBot();
