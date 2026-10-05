const {default:makeWASocket,useMultiFileAuthState,downloadMediaMessage}=require('@whiskeysockets/baileys');
const P=require('pino');
const QRCode=require('qrcode');
const express=require('express');
const fs=require('fs');
const app=express();
let lastQR=null,ok=false;

app.get('/',(req,res)=>{
 if(ok) res.send('<h1>✅ شغال - النهائي الذكي</h1><p>4 تجارب + Human + فويس + عربي/انجليزي</p>');
 else if(lastQR) res.send('<h1><a href="/qr">QR</a></h1>');
 else res.send('<h1>عم حضر...</h1>');
});
app.get('/qr',async(req,res)=>{
 if(!lastQR) return res.send('ما في QR - نطر 20 ثانية واعمل ريفريش');
 const img=await QRCode.toBuffer(lastQR,{width:400});
 res.type('png').send(img);
});
app.listen(process.env.PORT||10000);

const sleep=m=>new Promise(r=>setTimeout(r,m));
let Groq=null; 
try{ if(process.env.GROQ_API_KEY) Groq=require('groq-sdk'); }catch(e){}

let selfReplyCount=0;
const MAX_SELF=4;
const lastHumanReply=new Map(); // jid -> time
const PAUSE_MIN=30; // دقايق يسكت بعد ما انت ترد

async function transcribe(buf){
 if(!process.env.GROQ_API_KEY) return null;
 try{
  const groq=new Groq({apiKey:process.env.GROQ_API_KEY});
  fs.writeFileSync('/tmp/voice.ogg',buf);
  const tr=await groq.audio.transcriptions.create({
   file:fs.createReadStream('/tmp/voice.ogg'),
   model:'whisper-large-v3'
  });
  return tr.text;
 }catch(e){ console.log('trans err',e.message); return null; }
}

async function lebaneseAI(text,isVoice=false){
 if(!process.env.GROQ_API_KEY) return 'هلا يا قلبي 😍 كيفك؟';
 try{
  const groq=new Groq({apiKey:process.env.GROQ_API_KEY});
  const prompt=isVoice?`حدا بعت فويس وقال: "${text}". رد بلبناني مهضوم قصير`:text;
  const r=await groq.chat.completions.create({
   model:'llama-3.1-8b-instant',
   messages:[
    {role:'system',content:'انت شب لبناني من صيدا عمرك 24 مهضوم كتير، بتحكي عامية بيضا. بتفهم كلشي: عربي، انجليزي، فرانكو، واختصارات واتساب متل hbb=حبيبي، hbbt=حبيبتي، wya=وينك، wyd=شو عم تعمل، 3mlek=عم قلك، brb, lol, omg, idk, tbh, kifak, shu, wallah, yalla, habibi. ردودك قصيرة طبيعية مش روبوت، بتحط ايموجي خفيف. ما بتقول انك ذكاء اصطناعي.'},
    {role:'user',content:prompt}
   ],
   temperature:0.9
  });
  return r.choices[0].message.content;
 }catch(e){ console.log(e.message); return 'يا هلا والله 😅 كيفك انت؟'; }
}

async function run(){
 const {state,saveCreds}=await useMultiFileAuthState('./auth');
 const sock=makeWASocket({auth:state,logger:P({level:'silent'})});
 sock.ev.on('creds.update',saveCreds);
 sock.ev.on('connection.update',u=>{
  if(u.qr) lastQR=u.qr;
  if(u.connection==='open'){ ok=true; console.log('✅ Connected FINAL'); }
  if(u.connection==='close'){ ok=false; setTimeout(run,3000); }
 });
 sock.ev.on('messages.upsert',async({type,messages})=>{
  if(type!=='notify') return;
  const m=messages[0];
  if(!m.message) return;
  const jid=m.key.remoteJid;
  if(jid.includes('broadcast')||jid.includes('status')) return;

  // انت يلي باعت الرسالة
  if(m.key.fromMe){
   // وضع التجربة: اول 4 مرات بيرد عليك
   if(selfReplyCount < MAX_SELF){
    selfReplyCount++;
    const txt=m.message.conversation||m.message.extendedTextMessage?.text||'';
    if(!txt) return;
    console.log(`[تجربة ${selfReplyCount}/${MAX_SELF}] انت بعت: ${txt} - ناطر 10 ثواني...`);
    await sleep(10000);
    const reply=await lebaneseAI(txt,false);
    await sock.sendMessage(jid,{text:reply + `\n\n(تجربة ${selfReplyCount}/${MAX_SELF})`});
    if(selfReplyCount>=MAX_SELF){
     await sleep(1000);
     await sock.sendMessage(jid,{text:'✅ خلصت 4 تجارب! هلق بطلت رد على حالي. صرت ارد بس على العالم، واذا انت رديت على حدا بسكت 30 دقيقة - Human Takeover شغال 👑'});
    }
    return;
   }
   // بعد التجارب: اي شي بتبعتو انت = انت استلمت المحادثة
   console.log('انت رديت على',jid,'- البوت سكت 30 دقيقة');
   lastHumanReply.set(jid,Date.now());
   return;
  }

  // حدا تاني باعت - شوف اذا انت رادد من قريب
  const last=lastHumanReply.get(jid);
  if(last){
   const diff=(Date.now()-last)/1000/60;
   if(diff < PAUSE_MIN){
    console.log(`ساكت عن ${jid} لانو انت رديت من ${diff.toFixed(1)}د`);
    return;
   }else{ lastHumanReply.delete(jid); }
  }

  let text=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||'';
  const isVoice=m.message.audioMessage||m.message.voiceMessage;
  if(!text && !isVoice) return;

  console.log('رسالة من',jid,'- ناطر 10 ثواني...');
  await sleep(10000);

  // فحص تاني قبل الرد - بل كي انت رديت بهالـ10 ثواني
  if(lastHumanReply.has(jid)){
   const d=(Date.now()-lastHumanReply.get(jid))/1000/60;
   if(d < PAUSE_MIN) return;
  }

  try{
   if(isVoice){
    const buf=await downloadMediaMessage(m,'buffer',{},{logger:P({level:'silent'}),reuploadRequest:async()=>{}});
    const t=await transcribe(buf);
    console.log('فويس:',t);
    if(!t){ await sock.sendMessage(jid,{text:'ما سمعت الفويس منيح، فيك تكتبلي؟ 😅'},{quoted:m}); return; }
    const reply=await lebaneseAI(t,true);
    await sock.sendMessage(jid,{text:reply},{quoted:m});
   }else{
    console.log('نص:',text);
    const reply=await lebaneseAI(text,false);
    await sock.sendMessage(jid,{text:reply},{quoted:m});
   }
  }catch(e){ console.log(e); }
 });
}
run();
