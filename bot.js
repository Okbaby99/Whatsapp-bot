const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const Groq = require('groq-sdk');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

let lastSeenOnline = Date.now();
let qrCodeData = '';
let isConnected = false;

app.get('/', (req,res) => res.send('✅ شغال'));
app.get('/status', (req,res) => {
  let diff = Math.floor((Date.now() - lastSeenOnline)/1000/60 * 10)/10;
  let msg = diff < 5? `😴 انت بعدك اونلاين - البوت ساكت` : `✅ صرت اوفلاين ${diff} دقيقة - البوت جاهز يرد`;
  res.send(`<div style="text-align:center;font-family:sans-serif;margin-top:50px;font-size:22px">منذ ${diff} دقيقة<br><br>${msg}</div>`);
});
app.get('/qr', async (req,res) => {
  if(isConnected) return res.send('<h1 style="text-align:center;margin-top:100px">✅ CONNECTED</h1>');
  if(!qrCodeData) return res.send('<h1>⏳ نطر 10 ثواني</h1>');
  let qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`<div style="text-align:center;margin-top:30px"><img src="${qrImage}" style="width:300px"></div>`);
});

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

client.on('qr', qr => { qrCodeData = qr; console.log('QR Ready'); });
client.on('ready', () => { isConnected = true; console.log('READY!'); });
client.on('disconnected', () => { isConnected = false; });

// هيدا السطر الوحيد الصح - بس اذا انت بعتت
client.on('message_create', (m) => {
  if(m.fromMe) {
    lastSeenOnline = Date.now();
    console.log('FROM ME - انت اونلاين');
  }
});

client.on('message', async msg => {
  if(msg.fromMe || msg.isGroup || msg.isStatus) return;
  let offlineMinutes = (Date.now() - lastSeenOnline) / 1000 / 60;
  console.log(`رسالة: ${msg.body} | اوفلاين من: ${offlineMinutes.toFixed(1)} د`);

  if(offlineMinutes < 5) {
    console.log(`ساكت - بعدك اونلاين`);
    return;
  }

  console.log(`عم يرد...`);
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `انت شاب لبناني 22 سنة، بتحكي واتساب شبابي: هههه، حب، خيي، لك، ولك، ايه والله، يلا، تمام. ردود قصيرة سطر او سطرين. ما تقول انك بوت.` },
        { role: "user", content: msg.body }
      ],
      max_tokens: 150
    });
    let reply = completion.choices[0].message.content;
    await client.sendMessage(msg.from, reply);
    console.log('رد: ' + reply);
  } catch(e) {
    console.log('Error:', e.message);
    await client.sendMessage(msg.from, 'هلا حب! شوي وبرجعلك ههه');
  }
});

client.initialize();
app.listen(process.env.PORT || 10000, ()=>console.log('running'));
