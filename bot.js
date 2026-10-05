const {default:makeWASocket,useMultiFileAuthState,downloadMediaMessage,DisconnectReason} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');
const express = require('express');
const gtts = require('node-gtts');
const tts = gtts('ar');
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
function textToVoice(text, file){ return new Promise((res, rej)=>{ tts.save(file, text, err=> err?rej(err):res()); }); }
const app = express();
let lastQR = null;
let isConnected = false;
app.get('/', (req,res)=>{
  if(isConnected) res.send('<h1>✅ الوكيل شغال يا روني!</h1>');
  else if(lastQR) res.send(`<h1>اعمل سكان للـ QR</h1><img src="/qr" style="width:350px"><br><a href="/">Refresh</a><script>setTimeout(()=>location.reload(),5000)</script>`);
  else res.send('<h1>عم حضّر الـ QR... عمل Refresh بعد 5 ثواني</h1><script>setTimeout(()=>location.reload(),5000)</script>');
});
app.get('/qr', async(req,res)=>{
  if(!lastQR) return res.send('لسا ما طلع QR');
  const img = await QRCode.toBuffer(lastQR, {width:600});
  res.type('png').send(img);
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Web on '+PORT));
async function run(){
const {state,saveCreds}=await useMultiFileAuthState('auth_info_baileys');
const sock=makeWASocket({auth:state,logger:P({level:'silent'}),browser:["WA-Bot","Chrome","1"]});
sock.ev.on('creds.update',saveCreds);
sock.ev.on('connection.update',u=>{
 if(u.qr){ lastQR=u.qr; isConnected=false; console.log('QR جديد'); }
 if(u.connection==='open'){ isConnected=true; lastQR=null; console.log('✅ CONNECTED'); }
 if(u.connection==='close'){ isConnected=false; const shouldReconnect = u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut; if(shouldReconnect) setTimeout(run,3000); }
});
sock.ev.on('messages.upsert',async({type,messages})=>{
if(type!=='notify') return;
const m=messages[0]; if(!m.message || m.key.fromMe) return;
const jid=m.key.remoteJid;
if(jid==='status@broadcast' || jid.includes('@g.us')) return;
let text = m.message.conversation||m.message.extendedTextMessage?.text||"";
let isVoiceIn = false;
if(m.message.audioMessage || m.message.pttMessage){
 isVoiceIn=true;
 try{
  const buf=await downloadMediaMessage(m,'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage});
  const fp=`./in_${Date.now()}.ogg`; fs.writeFileSync(fp,buf);
  const Groq=require('groq-sdk');
  const groq=new Groq({apiKey:process.env.GROQ_API_KEY});
  const tr=await groq.audio.transcriptions.create({file:fs.createReadStream(fp),model:"whisper-large-v3"});
  text=tr.text||""; fs.unlinkSync(fp);
 }catch(e){ text="kifak"; }
}
text=text.trim(); if(!text) return;
await sock.readMessages([m.key]);
await sock.sendPresenceUpdate('composing',jid);
await sleep(10000);
await sock.sendPresenceUpdate('paused',jid);
let reply="";
try{
 const Groq=require('groq-sdk');
 const groq=new Groq({apiKey:process.env.GROQ_API_KEY});
 const r=await groq.chat.completions.create({
   model:"llama-3.3-70b-versatile", temperature:0.85,
   messages:[
     {role:"system",content:"You are Rony 22y from Saida Lebanon. Talk franco lebanese short max 15 words: kifak wenak wala shi a3ed bl bet hamdella yala habibi wallah. Natural like friend. If asked who are you: ana rony habibi kenet mashghoul shway. Never say AI."},
     {role:"user",content:text}
   ]
 });
 reply=r.choices[0].message.content;
}catch(e){reply="wala shi a3ed bl bet enta shu akhbarak?";}
const shouldVoice = isVoiceIn? Math.random()<0.6 : Math.random()<0.3;
try{
 if(shouldVoice){
  const file=`./v_${Date.now()}.mp3`;
  await textToVoice(reply,file);
  await sock.sendMessage(jid,{audio:{url:file},mimetype:'audio/mpeg',ptt:true});
  setTimeout(()=>{try{fs.unlinkSync(file)}catch{}},5000);
 }else{ await sock.sendMessage(jid,{text:reply}); }
}catch(e){ await sock.sendMessage(jid,{text:reply}); }
});
}
run();
