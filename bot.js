// Fix crypto error for Render
global.crypto = require('crypto');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
let sock = null;

async function startBot(){
  try{
    console.log('Starting bot...');
    const {default: makeWASocket, useMultiFileAuthState} = require('@whiskeysockets/baileys');
    const pino = require('pino');
    const {state, saveCreds} = await useMultiFileAuthState('auth_info_baileys');
    sock = makeWASocket({
      auth: state,
      logger: pino({level:'silent'}),
      printQRInTerminal: false,
      browser: ["Bot","Chrome","1.0"]
    });
    sock.ev.on('connection.update', async (u)=>{
      if(u.connection==='open'){ 
        console.log('CONNECTED SUCCESS'); 
      }
      if(u.connection==='close'){
        console.log('Closed, restarting...');
        setTimeout(startBot,5000);
      }
    });
    sock.ev.on('creds.update', saveCreds);
    console.log('Bot ready for pairing');
  }catch(e){ 
    console.log('Error', e.message);
    setTimeout(startBot,5000);
  }
}
startBot();

app.get('/', (req,res)=>{
  res.send(`
  <html><body style="background:#111;color:white;text-align:center;padding:30px;font-family:sans-serif">
  <h1 style="color:#25D366">بوت الواتساب - تم التصليح ✓</h1>
  <h3>حط رقمك مع رمز البلد بدون +</h3>
  <p>9613782814</p>
  <input id="num" value="9613782814" style="padding:12px;width:250px;font-size:18px;border-radius:8px;border:none;text-align:center">
  <br><br>
  <button onclick="getCode()" style="padding:12px 30px;background:#25D366;color:white;border:none;border-radius:8px;font-size:18px">جيب الكود</button>
  <h1 id="code" style="margin-top:30px;letter-spacing:5px;color:#25D366"></h1>
  <p id="info"></p>
  <br><br>
  <a href="/clear" style="color:gray">مسح الجلسة</a>
  <script>
  async function getCode(){
    let n = document.getElementById('num').value.replace(/[^0-9]/g,'');
    if(!n){ alert('حط الرقم'); return; }
    document.getElementById('code').innerText = 'عم بجيب الكود... نطر 10 ثواني';
    let r = await fetch('/pair?number='+n);
    let t = await r.text();
    document.getElementById('code').innerText = t;
    document.getElementById('info').innerText = 'واتساب > الاجهزة المرتبطة > ربط برقم الهاتف';
  }
  </script>
  </body></html>
  `);
});

app.get('/pair', async (req,res)=>{
  try{
    let number = (req.query.number||'').replace(/[^0-9]/g,'');
    if(!number) return res.send('حط ?number=961xxxx');
    if(!sock) return res.send('البوت بعدو عم يقلع - نطر 15 ثانية وجرب تاني');
    
    let code = await sock.requestPairingCode(number);
    console.log('Pairing code for '+number+': '+code);
    res.send(code);
  }catch(e){
    console.log('Pair error', e);
    res.send('غلط: ' + e.message);
  }
});

app.get('/clear', (req,res)=>{
  res.send('تم المسح! نطر 20 ثانية وارجع <br><br><a href="/">رجاع</a>');
  setTimeout(()=>{
    try{ require('fs').rmSync('auth_info_baileys',{recursive:true,force:true}); }catch(e){}
    setTimeout(()=>process.exit(0),1000);
  },2000);
});

app.listen(PORT, ()=>console.log('Server on '+PORT));
