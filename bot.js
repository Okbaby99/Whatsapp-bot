const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = null;

async function startBot(){
  try{
    const {default: makeWASocket, useMultiFileAuthState} = require('@whiskeysockets/baileys');
    const QRCode = require('qrcode');
    const pino = require('pino');
    const {state, saveCreds} = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({auth: state, logger: pino({level:'silent'}), printQRInTerminal: false});
    sock.ev.on('connection.update', async (u)=>{
      if(u.qr){ latestQR = await QRCode.toDataURL(u.qr); }
      if(u.connection==='open'){ latestQR=null; console.log('Connected'); }
      if(u.connection==='close'){ latestQR=null; setTimeout(startBot,3000); }
    });
    sock.ev.on('creds.update', saveCreds);
  }catch(e){ console.log('Bot error', e); }
}
startBot();

app.get('/', (req,res)=>{ res.send('Live - <a href="/qr">QR</a> - <a href="/clear">Clear</a>'); });

app.get('/qr', (req,res)=>{
  if(!latestQR){ return res.send('<body style="background:black;color:white;text-align:center;padding-top:50px"><h2>عم يولد الـ QR... انطر 10 ثواني</h2><script>setTimeout(()=>location.reload(),4000)</script></body>'); }
  res.send(`<body style="background:black;color:white;text-align:center"><h2>امسح الـ QR</h2><img src="${latestQR}" style="width:300px;background:white;padding:10px"><script>setTimeout(()=>location.reload(),25000)</script></body>`);
});

app.get('/clear', (req,res)=>{
  try{ require('fs').rmSync('auth_info_baileys',{recursive:true,force:true}); require('fs').mkdirSync('auth_info_baileys'); latestQR=null; res.send('تم المسح - <a href="/qr">روح عال QR</a>'); }catch(e){ res.send('ما في جلسة - <a href="/qr">QR</a>'); }
});

app.listen(PORT, ()=>console.log('Server on '+PORT));
