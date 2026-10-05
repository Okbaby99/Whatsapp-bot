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
app.get('/status', (req,res) => {
  let diff = Math.floor((Date.now() - lastSeenOnline)/1000/60 * 10)/10;
  let msg = diff < 2? `😴 انت بعدك اونلاين - البوت ساكت` : `✅ صرت اوفلاين ${diff} دقيقة - البوت جاهز يرد`;
  res.send(`<div style="text-align:center;font-family:sans-serif;margin-top:50px;font-size:22px">منذ ${diff} دقيقة<br><br>${msg}</div>`);
});
app.get('/qr', async (req,res) => {
  if(isConnected) return res.send('<h1 style="text-align:center;margin-top:100px">✅ CONNECTED - 2 MIN MODE 🧠</h1><br><center><a href="/status">شوف الـ status</a></center>');
  if(!qrCodeData) return res.send('<h1>⏳ نطر 10 ثواني واعمل ريفريش</h1>');
  let qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<div style="text-align:center;margin-top:30px"><img src="${qrImage}" style="width:300px"></div>`);
});

async function startClient() {
  const executablePath = await chromium.executablePath();
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
    }
  });

  client.on('qr', qr => { qrCodeData = qr; });
  client.on('ready', () => { isConnected = true; console.log('READY!'); });
  client.on('disconnected', () => { isConnected = false; });
  client.on('message_create', (m) => { if(m.fromMe) lastSeenOnline = Date.now(); });

  client.on('message', async msg => {
    if(msg.fromMe || msg.isGroup || msg.isStatus) return;
    let offlineMinutes = (Date.now() - lastSeenOnline) / 1000 / 60;
    if(offlineMinutes < 2) return;

    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
      await new Promise(r => setTimeout(r, 1200));

      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: `انت شب لبناني 22 سنة بتحكي واتساب قصير جدا: ههه، لك، خيي. رد بسطر واحد قصير.` },
          { role: "user", content: msg.body }
        ],
        max_tokens: 60,
        temperature: 0.8
      });

      await chat.clearState();
      await client.sendMessage(msg.from, completion.choices[0].message.content);
    } catch(e) {
      console.log(e);
      try {
        const chat = await msg.getChat();
        await chat.clearState();
        await client.sendMessage(msg.from, 'هلا حب! شوي وبرجعلك');
      } catch {}
    }
  });

  await client.initialize();
}

startClient();
app.listen(process.env.PORT || 10000, ()=>console.log('running'));
