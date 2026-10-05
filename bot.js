const {default:makeWASocket,useMultiFileAuthState}=require('@whiskeysockets/baileys');
const P=require('pino');
const QRCode=require('qrcode');
const express=require('express');
const app=express();
let lastQR=null;
let ok=false;
app.get('/',(req,res)=>{
 if(ok) res.send('<h1>✅ شغال</h1><a href="/qr">QR</a>');
 else if(lastQR) res.send('<h1><a href="/qr">فوت عالـ QR</a></h1>');
 else res.send('<h1>عم حضر...</h1>');
});
app.get('/qr',async(req,res)=>{
 if(!lastQR) return res.send('بعدو ما طلع');
 const img=await QRCode.toBuffer(lastQR,{width:400});
 res.type('png').send(img);
});
app.listen(process.env.PORT||10000);
const sleep=m=>new Promise(r=>setTimeout(r,m));
function reply(t){
 t=(t||'').toLowerCase();
 if(t.match(/هلا|مرحبا|hi|hlo|hello/)) return 'هلااا والله 😍 كيفك؟';
 if(t.match(/كيفك|kifak|kifik/)) return 'الحمدلله تمام انت كيفك؟';
 if(t.match(/بحبك|bhebek/)) return 'وانا بحبك اكتر 🥰';
 return 'فهمت عليك "'+t+'" - احكيني اكتر 😎';
}
async function run(){
 const {state,saveCreds}=await useMultiFileAuthState('./auth');
 const sock=makeWASocket({auth:state,logger:P({level:'silent'})});
 sock.ev.on('creds.update',saveCreds);
 sock.ev.on('connection.update',u=>{
  if(u.qr) lastQR=u.qr;
  if(u.connection==='open'){ok=true; console.log('open');}
  if(u.connection==='close') run();
 });
 sock.ev.on('messages.upsert',async({type,messages})=>{
  if(type!=='notify') return;
  const m=messages[0];
  if(!m.message||m.key.fromMe) return;
  let txt=m.message.conversation||m.message.extendedTextMessage?.text||'';
  if(!txt) return;
  console.log('msg:',txt);
  await sleep(10000);
  await sock.sendMessage(m.key.remoteJid,{text:reply(txt)},{quoted:m});
 });
}
run();
