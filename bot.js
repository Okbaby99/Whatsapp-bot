const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 10000;

let latestQR = null;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { qr, connection } = update;
        if (qr) {
            console.log('QR Generated!');
            latestQR = await QRCode.toDataURL(qr);
        }
        if (connection === 'open') {
            console.log('Bot Connected!');
            latestQR = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBot();

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('Bot Live! <br><br> <a href="/qr">فوت على QR من هون - /qr</a> <br> <a href="/pair?number=96103782814">او فوت على الكود - /pair</a>');
});

// صفحة الـ QR الجديدة - هي يلي كانت ناقصة عندك
app.get('/qr', (req, res) => {
    if (!latestQR) {
        return res.send(`
            <html><body style="background:black;color:white;text-align:center;padding-top:50px;font-family:sans-serif">
            <h2>عم يولد الـ QR ... انطر 10 ثواني واعمل Refresh</h2>
            <p>خليك فاتح الصفحة - رح يطلع لحالو</p>
            <script>setTimeout(()=>location.reload(),5000)</script>
            </body></html>
        `);
    }
    res.send(`
        <html><body style="background:black;color:white;text-align:center;padding-top:20px;font-family:sans-serif">
        <h2>امسح الـ QR بواتساب</h2>
        <img src="${latestQR}" style="width:300px;height:300px;background:white;padding:10px" />
        <p>واتساب > الاعدادات > الاجهزة المرتبطة > ربط جهاز</p>
        <p style="color:yellow">بينتهي بعد 30 ثانية - اعمل Refresh اذا خلص</p>
        <script>setTimeout(()=>location.reload(),25000)</script>
        </body></html>
    `);
});

app.get('/pair', async (req,res)=>{
    // هون كود الـ pair القديم تبعك
    res.send('روح على /qr - اذا بدك كود حط ?number=96103782814');
});

app.listen(PORT, () => console.log('Server on ' + PORT));
