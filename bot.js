const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
let sock = null;
let pairingCode = null;

async function startBot(){
  try{
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
        pairingCode = null;
      }
      if(u.connection==='close'){
        console.log('Closed');
        setTimeout(startBot,5000);
      }
    });
    sock.ev.on('creds.update', saveCreds);
    console.log('Bot started, waiting for pair request');
  }catch(e){ 
    console.log('Error', e.message);
    setTimeout(startBot,5000);
  }
}
startBot();

app.get('/', (req,res)=>{
  res.send(`
  <html><body style="background:#111;color:white;text-align:center;padding:30px;font-family:sans-serif">
  <h1 style="color:#25D366">بوت الواتساب</h1>
  <h3>حط رقمك مع رمز البلد بدون +</h3>
  <p>مثال لبنان: 96176123456</p>
  <p>مثال السعودية: 966512345678</p>
  <input id="num" placeholder="961xxxxxxxx" style="padding:12px;width:250px;font-size:18px;border-radius:8px;border:none;text-align:center">
  <br><br>
  <button onclick="getCode()" style="padding:12px 30px;background:#25D366;color:white;border:none;border-radius:8px;font-size:18px">جيب الكود</button>
  <h1 id="code" style="margin-top:30px;letter-spacing:5px"></h1>
  <p id="info"></p>
  <br><br>
  <a href="/clear" style="color:gray">مسح الجلسة /clear</a>
  <script>
  async function getCode(){
    let n = document.getElementById('num').value;
    if(!n){ alert('حط الرقم'); return; }
    document.getElementById('code').innerText = 'عم بجيب الكود... نطر 10 ثواني';
    let r = await fetch('/pair?number='+n);
    let t = await r.text();
    document.getElementById('code').innerText = t;
    document.getElementById('info').innerText = 'روح واتساب > الاجهزة المرتبطة > ربط ب رقم الهاتف وحط هيدا الكود';
  }
  </script>
  </body></html>
  `);
});

app.get('/pair', async (req,res)=>{
  try{
    let number = req.query.number;
    if(!number) return res.send('حط ?number=961xxxx');
    number = number.replace(/[^0-9]/g,'');
    if(!sock) return res.send('البوت بعدو عم يقلع - نطر 15 ثانية وجرب تاني');
    
    // طلب كود الاقتران
    let code = await sock.requestPairingCode(number);
    pairingCode = code;
    console.log('Pairing code for '+number+': '+code);
    res.send(code);
  }catch(e){
    console.log('Pair error', e);
    res.send('غلط: ' + e.message + ' - تأكد الرقم صح وجرب تاني بعد 30 ثانية');
  }
});

app.get('/clear', (req,res)=>{
  res.send('تم المسح! البوت عم يعمل ريستارت... نطر 20 ثانية وارجع على الصفحة الرئيسية <br><br><a href="/">رجاع عالرئيسية</a>');
  setTimeout(()=>{
    try{ require('fs').rmSync('auth_info_baileys',{recursive:true,force:true}); }catch(e){}
    setTimeout(()=>process.exit(0),1000);
  },2000);
});

app.listen(PORT, ()=>console.log('Server on '+PORT));
