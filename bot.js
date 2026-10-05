const {default:makeWASocket,useMultiFileAuthState} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');
const express = require('express');
const gtts = require('node-gtts');
const tts = gtts('ar');
const sleep = (ms) => new Promise(r=>setTimeout(r,ms))

function textToVoice(text, file){
  return new Promise((res,rej)=>{
    tts.save(file, text, (err)=>{
      if(err) rej(err);
      else res(file);
    })
  })
}

const app = express();
let lastQR = null;
let isConnected = false;

app.get('/', (req,res)=>{
  if(isConnected) res.send('<h1>✅ البوت شغال يا روني</h1><p><a href="/qr">QR</a></p>');
  else if(lastQR) res.send('<h1>اعمل سكان للـ QR من /qr</h1><a href="/qr">روح عالـ QR</a>');
  else res.send('<h1>عم حضر الـ QR... اعمل Refresh</h1>');
});

app.get('/qr', async(req,res)=>{
  if(!lastQR) return res.send('لسا ما طلع QR - اعمل ريفريش بعد شوي');
  const img = await QRCode.toBuffer(lastQR, {width:300});
  res.type('png').send(img);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log('Web on '+PORT));

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
    if(!text) return;
    console.log('وصل:', text, 'من:', jid, 'مني؟', m.key.fromMe);

    try{
      let file = './voice.mp3';
      await textToVoice(text, file);
      await sleep(500);
      await sock.sendMessage(jid, {audio: fs.readFileSync(file), mimetype:'audio/mpeg', ptt:true}, {quoted:m});
      console.log('تم الارسال');
    }catch(e){ console.log(e); }
  });
}
run();
