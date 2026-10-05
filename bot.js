const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const Groq = require('groq-sdk');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium-min');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

let lastSeenOnline = Date.now();
let qrCodeData = '';
let isConnected = false;

app.get('/', (req,res) => res.send('✅ شغال'));
app.get('/qr', async (req,res) => {
  if(isConnected) return res.send('<h1 style="text-align:center">✅ CONNECTED</h1>');
  if(!qrCodeData) return res.send('<h1>⏳ نطر 10 ثواني واعمل ريفريش</h1>');
  let img = await qrcode.toDataURL(qrCodeData);
  res.send(`<center><img src="${img}" style="width:300px"><p>اعمل Scan من واتساب</p></center>`);
});
app.get('/status', (req,res) => {
  let m = Math.floor((Date.now()-lastSeenOnline)/1000/60*10)/10;
  res.send(`<h1 style="text-align:center;margin-top:50px">${m<2?'😴 انت اونلاين':'✅ اوفلاين '+m+' د'}</h1>`);
});

async function startBot(){
  const executablePath = await chromium.executablePath();
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport
    }
  });

  client.on('qr', q => { qrCodeData = q; console.log('QR READY'); });
  client.on('ready', () => { isConnected = true; console.log('READY'); });
  client.on('message_create', m => { if(m.fromMe) lastSeenOnline = Date.now(); });

  client.on('message', async msg => {
    if(msg.fromMe || msg.fromGroup || msg.from === 'status@broadcast') return;
    if((Date.now()-lastSeenOnline)/1000/60 < 2) return;
    try{
      const chat = await msg.getChat();
      await chat.sendStateTyping();
      await new Promise(r=>setTimeout(r,1000));
      const comp = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {role:"system", content:"انت شب لبناني، بتحكي قصير ومهضوم: ههه، لك، خيي، والله. جواب سطر واحد بس."},
          {role:"user", content: msg.body}
        ],
        max_tokens: 60
      });
      await chat.clearState();
      await client.sendMessage(msg.from, comp.choices[0].message.content);
    }catch(e){ console.log(e.message); }
  });

  await client.initialize();
}

startBot();
app.listen(process.env.PORT || 10000, ()=>console.log('Server up'));
