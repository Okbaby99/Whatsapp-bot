const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = null;

async function startBot(){
  try{
    console.log('Starting bot...');
    const {default: makeWASocket, useMultiFileAuthState} = require('@whiskeysockets/baileys');
    const QRCode = require('qrcode');
    const pino = require('pino');
    const {state, saveCreds} = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
      auth: state,
      logger: pino({level:'silent'}),
      printQRInTerminal: false,
      browser: ["Bot","Chrome","1.0"]
    });
    sock.ev.on('connection.update', async (u)=>{
      if(u.qr){ 
        console.log('QR ready'); 
        latestQR = await QRCode.toDataURL(u.qr); 
      }
      if(u.connection==='open'){ 
        latestQR=null; 
        console.log('Connected OK'); 
      }
      if(u.connection==='close'){ 
        latestQR=null; 
        console.log('Closed, restarting in 5s');
        setTimeout(startBot,5000); 
      }
    });
    sock.ev.on('creds.update', saveCreds);
  }catch(e){ 
    console.log('Start error', e.message);
    setTimeout(startBot,5000);
  }
}
startBot();

app.get('/', (req,res)=>{ res.send('Live - <a href="/qr">QR</a> | <a href="/clear">Clear</a>'); });

app.get('/qr', (req,res)=>{
  if(!latestQR){
    return res.send(`<html><body style="background:black;color:white;text-align:center;padding-top:50px;font-family:sans-serif">
    <h2>عم ولّد الـ QR... انطر 20 ثانية</h2>
    <h3>الصفحة بتحدّث لحالها - ما تسكرها</h3>
    <p>اذا ما طلع بعد دقيقة - فوت على /clear وارجع</p>
    <script>setTimeout(()=>location.reload(),5000)</script>
    </body></html>`);
  }
  res.send(`<html><body style="background:black;color:white;text-align:center;padding-top:20px">
  <h1 style="color:#25D366">امسح هيدا الـ QR بسرعة!</h1>
  <img src="${latestQR}" style="width:320px;height:320px;background:white;padding:12px;border-radius:12px" />
  <p>واتساب > الاجهزة المرتبطة > ربط جهاز</p>
  <p>الـ QR بيتغير كل 25 ثانية</p>
  <script>setTimeout(()=>location.reload(),25000)</script>
  </body></html>`);
});

app.get('/clear', (req,res)=>{
  res.send('تم مسح الجلسة! البوت عم يرجع يقلع... نطر 15 ثانية وفوت على /qr <br><br><a href="/qr">فوت عال QR بعد 15 ثانية</a>');
  setTimeout(()=>{
    try{ require('fs').rmSync('auth_info_baileys',{recursive:true,force:true}); }catch(e){}
    latestQR=null;
    console.log('Cleared - exiting to restart');
    setTimeout(()=>process.exit(0),1000);
  },2000);
});

app.listen(PORT, ()=>console.log('Server on '+PORT));
