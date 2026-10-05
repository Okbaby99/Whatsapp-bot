const {default:makeWASocket,useMultiFileAuthState,downloadMediaMessage} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');
const express = require('express');
const OpenAI = require('openai');

const app = express();
let lastQR = null;
let isConnected = false;

app.get('/', (req,res)=>{
  if(isConnected) res.send('<h1>✅ البوت شغال</h1><a href="/qr">QR</a>');
  else if(lastQR) res.send('<h1><a href="/qr">روح عالـ QR</a></h1>');
  else res.send('<h1>عم حضر الـ QR... Refresh</h1>');
})
app.get('/qr', async(req,res)=>{
  if(!lastQR) return res.send('لسا ما طلع QR');
  const img = await QRCode.toBuffer(lastQR, {width:300});
  res.type('png').send(img);
});
app.listen(process.env.PORT || 10000, ()=>console.log('Web on'));

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

async function transcribeVoice(msg){
  try{
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {logger: P({level:'silent'}), reuploadRequest: async()=>{}});
    fs.writeFileSync('./voice.ogg', buffer);
    const tr = await openai.audio.transcriptions.create({
      file: fs.createReadStream('./voice.ogg'),
      model: 'whisper-1'
    });
    return tr.text;
  }catch(e){ console.log('transcribe error', e); return null; }
}

async function getLebaneseReply(text){
  try{
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {role:'system', content: 'انت شاب لبناني مهضوم بتحكي لهجة لبنانية بيضا عامية. بتفهم كل اللغات عربي انجليزي فرنسي و لغة الواتساب المختصرة متل "hbb, 3mlek, wya, brb". وظيفتك ترد بطريقة طبيعية كأنك انسان حقيقي مش روبوت. ردودك قصيرة مهضومة وبتفهم السياق. ما بتقول انك ذكاء اصطناعي.'},
        {role:'user', content: text}
      ]
    });
    return r.choices[0].message.content;
  }catch(e){ console.log(e); return 'هلا والله! كيفك؟'; }
}

async function run(){
  const {state,saveCreds}=await useMultiFileAuthState('./auth');
  const sock=makeWASocket({auth:state,logger:P({level:'silent'})});
  sock.ev.on('creds.update',saveCreds);
  sock.ev.on('connection.update',u=>{
    if(u.qr){ lastQR=u.qr; isConnected=false; console.log('QR جديد'); }
    if(u.connection==='open'){ isConnected=true; console.log('اتصل!'); }
    if(u.connection==='close'){ isConnected=false; run(); }
  });

  sock.ev.on('messages.upsert',async({type,messages})=>{
    if(type!=='notify') return;
    const m=messages[0];
    if(!m.message) return;
    const jid=m.key.remoteJid;
    if(jid.includes('@broadcast') || jid==='status@broadcast') return;

    let text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption;
    const isVoice = m.message.audioMessage || m.message.voiceMessage;

    if(!text &&!isVoice) return;

    // هون نقطة 1 يلي بدك ياها - بينطر 10 ثواني قبل ما يرد
    console.log('اجت رسالة، ناطر 10 ثواني...');
    await sleep(10000);

    try{
      if(isVoice){
        const transcribed = await transcribeVoice(m);
        if(!transcribed){
          await sock.sendMessage(jid, {text: 'ما قدرت اسمع الفويس منيح، فيك تعيدو؟'}, {quoted:m});
          return;
        }
        console.log('الفويس قال:', transcribed);
        const reply = await getLebaneseReply(`حدا بعتلك فويس عم يقول: "${transcribed}". فسر شو قال ورد عليه بلهجة لبنانية بطريقة طبيعية`);
        await sock.sendMessage(jid, {text: reply}, {quoted:m});
      }else{
        console.log('النص:', text);
        const reply = await getLebaneseReply(text);
        await sock.sendMessage(jid, {text: reply}, {quoted:m});
