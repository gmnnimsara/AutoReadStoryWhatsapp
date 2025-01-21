let { autoLikeStatus, downloadMediaStatus, sensorNomor, blackList, whiteList } = require('./config');
const { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, jidNormalizedUser, downloadMediaMessage} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

let useCode = true;
let loggedInNumber;

async function connectToWhatsApp(){
    const sessionPath = path.join(__dirname, 'sessions');
    const sessionExists = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
    
    const { state, saveCreds } = await useMultiFileAuthState('sessions');

    const sock = makeWASocket({
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: !useCode,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 30000,
        browser: Browsers.macOS('Chrome'),
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: true,
        syncFullHistory: true,
        generateHighQualityLinkPreview: true
    });

    if (useCode && !sessionExists) {

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log("Halo sepertinya kamu belum login, Mau login wangsaf pakai pairing code?\nSilahkan balas dengan (y/n)\nketik y untuk setuju atau ketik n untuk login menggunakan qrcode") // pesan untuk yang menggunakan panel

        const askPairingCode = () => {
            rl.question('\nApakah kamu ingin menggunakan pairing code untuk login ke wangsaf? (y/n): ', async (answer) => {
                if (answer.toLowerCase() === 'y' || answer.trim() === '') {
                    console.log("\nWokeh kalau gitu silahkan masukkan nomor wangsafmu!\ncatatan : awali dengan 62 contoh 628123456789") // pesan untuk yang menggunakan panel
                    const askWaNumber = () => {
                        rl.question('\nMasukkan nomor wangsaf Anda: ', async (waNumber) => {
                            if (!/^\d+$/.test(waNumber)) {
                                console.log('\nNomor harus berupa angka!\nSilakan masukkan nomor wangsaf kembali!.');
                                askWaNumber();
                            } else if (!waNumber.startsWith('62')) {
                                console.log('\nNomor harus diawali dengan 62!\nContoh : 628123456789\nSilakan masukkan nomor wangsaf kembali!.');
                                askWaNumber();
                            } else {
                                const code = await sock.requestPairingCode(waNumber);
                                console.log('\nCek notifikasi wangsafmu dan masukin kode login wangsaf:', code);
                                rl.close();
                            }
                        });
                    };
                    askWaNumber();
                } else if (answer.toLowerCase() === 'n') {
                    useCode = false;
                    console.log('\nBuka wangsafmu lalu klik titik tiga di kanan atas kemudian klik perangkat tertaut setelah itu Silahkan scan QR code dibawah untuk login ke wangsaf');
                    connectToWhatsApp();
                    rl.close();
                } else {
                    console.log('\nInput tidak valid. Silakan masukkan "y" atau "n".');
                    askPairingCode();
                }
            });
        };
    
        askPairingCode();
    }
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output.statusCode !== DisconnectReason.loggedOut;
            if(shouldReconnect) {
                console.log('Mencoba menghubungkan ke wangsaf...\n');
                connectToWhatsApp();
            } else {
                console.log('Terputus dari wangsaf, silahkan hapus folder sessions dan login ke wangsaf kembali');
            }
        } else if(connection === 'open') {
            console.log('Terhubung ke wangsaf')
            loggedInNumber = sock.user.id.split('@')[0].split(':')[0];
            let displayedLoggedInNumber = loggedInNumber;
            if (sensorNomor) {
                displayedLoggedInNumber = displayedLoggedInNumber.slice(0, 3) + '****' + displayedLoggedInNumber.slice(-2);
            }
            let messageInfo = `Bot *AutoReadStoryWhatsApp* Aktif!
Kamu berhasil login dengan nomor: ${displayedLoggedInNumber}

info status fitur:
- Auto Like Status: ${autoLikeStatus ? "*Aktif*" : "*Nonaktif*"}
- Download Media Status: ${downloadMediaStatus ? "*Aktif*" : "*Nonaktif*"}
- Sensor Nomor: ${sensorNomor ? "*Aktif*" : "*Nonaktif*"}

Ketik *#menu* untuk melihat menu perintah yang tersedia.`;

            sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: messageInfo });
            console.log(`kamu berhasil login dengan nomor: ${displayedLoggedInNumber} \n`);
            console.log("Bot sudah aktif!\n\nSelamat menikmati fitur auto read story whatsapp by github.com/Jauhariel\n\nCatatan :\n1. Kamu bisa menambahkan nomor yang tidak ingin kamu lihat story-nya secara otomatis di file config.js dengan menambahkan nomor pada variabel array blackList.\n\n2. Kamu bisa menambahkan hanya nomor tertentu yang ingin kamu lihat story-nya secara otomatis di file config.js dengan menambahkan nomor pada variabel array whiteList.\n\n3. Jika kamu ingin melihat story dari semua kontak, kosongkan variabel array blackList dan whiteList yang ada di file config.js.\n\n4. Ubah nilai variabel autoLikeStatus yang terdapat di file config.js menjadi false untuk menonaktifkan fitur auto-like pada status, atau ubah menjadi true untuk mengaktifkannya.\n\n5. Ubah nilai variabel downloadMediaStatus yang terdapat di file config.js menjadi true untuk secara otomatis mendownload media (foto, video, audio) dari status, atau ubah menjadi false untuk menonaktifkan fitur tersebut.\n\n6. Klik CTRL dan C pada keyboard secara bersamaan untuk memberhentikan bot!\n\n7. Hapus folder sessions jika ingin login dengan nomor lain atau jika terjadi masalah login, seperti stuck di menghubungkan ke wangsaf, lalu jalankan ulang dengan mengetik: npm start\n");
        }
    })
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        msg.type = Object.keys(msg.message)[0];

        msg.text = msg.type == "conversation" ? msg.message.conversation : "";

        const prefixes = [".", "#", "!", "/"];
        let prefix = prefixes.find(p => msg.text.startsWith(p));

        if (prefix) {
            msg.cmd = msg.text.trim().split(" ")[0].replace(prefix, "").toLowerCase();
        
            // args
            msg.args = msg.text.replace(/^\S*\b/g, "").trim().split("|");
        
            // command
            switch (msg.cmd) {
                case "on":
                    msg.args[0].trim() === "" 
                    ? await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: `mana argumennya ?\ncontoh ketik : #on autolike\n\nArgumen yang tersedia:\n\n#on autolike\nuntuk mengaktifkan fitur autolike\n\n#on dlmedia\nuntuk mengaktifkan fitur download media(foto,video, dan audio) dari story\n\n#on sensornomor\nuntuk mengaktifkan sensor nomor` }, { quoted: msg })
                    : msg.args.forEach(async arg => {
                        switch (arg.trim().toLowerCase()) {
                            case "autolike":
                                autoLikeStatus = true;
                                await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Auto Like Status aktif" }, { quoted: msg });
                                break;
                            case "dlmedia":
                                downloadMediaStatus = true;
                                await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Download Media Status aktif" }, { quoted: msg });
                                break;
                            case "sensornomor":
                                sensorNomor = true;
                                await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Sensor Nomor aktif" }, { quoted: msg });
                                break;
                            default:
                                await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: `Argumen tidak valid: ${arg}. Pilihan yang tersedia: autolike, dlmedia, sensornomor` }, { quoted: msg });
                                break;
                        }
                    });
                    break;
                case "off":
                    msg.args[0].trim() === "" 
                        ? await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: `mana argumennya ?\ncontoh ketik : #off autolike\n\nArgumen yang tersedia:\n\n#off autolike\nuntuk menonaktifkan fitur autolike\n\n#off dlmedia\nuntuk menonaktifkan fitur download media(foto,video, dan audio) dari story\n\n#off sensornomor\nuntuk menonaktifkan sensor nomor` }, { quoted: msg })
                        : msg.args.forEach(async arg => {
                            switch (arg.trim().toLowerCase()) {
                                case "autolike":
                                    autoLikeStatus = false;
                                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Auto Like Status nonaktif" }, { quoted: msg });
                                    break;
                                case "dlmedia":
                                    downloadMediaStatus = false;
                                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Download Media Status nonaktif" }, { quoted: msg });
                                    break;
                                case "sensornomor":
                                    sensorNomor = false;
                                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: "Sensor Nomor nonaktif" }, { quoted: msg });
                                    break;
                                default:
                                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: `Argumen tidak valid: ${arg}. Pilihan yang tersedia: autolike, dlmedia, sensornomor` }, { quoted: msg });
                                    break;
                            }
                        });
                    break;
                case "menu":
                    const menuMessage = `Daftar Menu:
contoh penggunaan: #on autolike

Perintah On:
*#on autolike*
Mengaktifkan fitur autolike

*#on dlmedia*
Mengaktifkan fitur download media (foto, video, dan audio) dari story

*#on sensornomor*
Mengaktifkan sensor nomor

Perintah Off:
*#off autolike*
Menonaktifkan fitur autolike

*#off dlmedia*
Menonaktifkan fitur download media (foto, video, dan audio) dari story

*#off sensornomor*
Menonaktifkan sensor nomor

Perintah Info:
*#info*
Menampilkan informasi status fitur`;

                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: menuMessage }, { quoted: msg });
                    break;
                case "info":
                    const infoMessage = `Informasi Status Fitur:
- Auto Like Status: ${autoLikeStatus ? "*Aktif*" : "*Nonaktif*"}
- Download Media Status: ${downloadMediaStatus ? "*Aktif*" : "*Nonaktif*"}
- Sensor Nomor: ${sensorNomor ? "*Aktif*" : "*Nonaktif*"}`;

                    await sock.sendMessage(`${loggedInNumber}@s.whatsapp.net`, { text: infoMessage }, { quoted: msg });
                    break;
            }
        }

        // status
        if (msg.key.remoteJid === "status@broadcast") {
            let senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : 'Tidak diketahui';
            let displaySendernumber = senderNumber;
            const senderName = msg.pushName || 'Tidak diketahui';

            if (sensorNomor && displaySendernumber !== 'Tidak diketahui') {
                displaySendernumber = displaySendernumber.slice(0, 3) + '****' + displaySendernumber.slice(-2);
            }

            if (msg.message.protocolMessage) {
                console.log(`Status dari ${senderName} (${displaySendernumber}) telah dihapus.\n`);
            } else if (!msg.message.reactionMessage) {
                if (blackList.includes(senderNumber)) {
                    console.log(`${senderName} (${displaySendernumber}) membuat status tapi karena ada di blacklist. Status tidak akan dilihat.\n`);
                    return;
                }

                if (whiteList.length > 0 && !whiteList.includes(senderNumber)) {
                    console.log(`${senderName} (${displaySendernumber}) membuat status tapi karena tidak ada di whitelist. Status tidak akan dilihat.\n`);
                    return;
                }

                const myself = jidNormalizedUser(sock.user.id);
                const emojiToReact = '💚';

                if (msg.key.remoteJid && msg.key.participant) {
                    await sock.readMessages([msg.key]);

                    if (autoLikeStatus) {
                        await sock.sendMessage(
                            msg.key.remoteJid,
                            { react: { key: msg.key, text: emojiToReact } },
                            { statusJidList: [msg.key.participant, myself] }
                        );
                    }

                    console.log(`Berhasil melihat ${autoLikeStatus ? "dan menyukai " : ""}status dari: ${senderName} (${displaySendernumber})\n`);

                    const targetNumber = loggedInNumber;
                    let messageContent = `Status dari *${senderName}* (${displaySendernumber}) telah dilihat ${autoLikeStatus ? "dan disukai" : ""}`;
                    let caption = msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || msg.message.extendedTextMessage?.text || "Tidak ada caption";

                    if (downloadMediaStatus) {
                        if (msg.type === "imageMessage" || msg.type === "videoMessage") {
                            messageContent = `Status ${msg.type === "imageMessage" ? "gambar" : "video"} dari *${senderName}* (${displaySendernumber}) telah dilihat ${autoLikeStatus ? "dan disukai" : ""}`;
    
                            try {
                                const buffer = await downloadMediaMessage(msg, "buffer", {}, {
                                    logger: pino({ level: 'fatal' }),
                                });
                            
                                await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { 
                                    [msg.type === "imageMessage" ? "image" : "video"]: Buffer.from(buffer),
                                    caption: `${messageContent} dengan caption : "*${caption}*"` 
                                });
                            } catch (error) {
                                console.error('Error uploading media:', error);
                                await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: `${messageContent} namun Gagal mengunggah media dari status ${msg.type === "imageMessage" ? "gambar" : "video"} dari *${senderName}* (${displaySendernumber}).` });
                            }
                        } else if (msg.type === "audioMessage") {
                            messageContent = `Status audio dari *${senderName}* (${displaySendernumber}) telah dilihat ${autoLikeStatus ? "dan disukai" : ""}. Berikut audionya.`;
    
                            await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: messageContent });
    
                            try {
                                const buffer = await downloadMediaMessage(msg, "buffer", {}, {
                                    logger: pino({ level: 'fatal' }),
                                });
                    
                                await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { 
                                    audio: Buffer.from(buffer),
                                    caption: "" 
                                });
                            } catch (error) {
                                console.error('Error uploading audio:', error);
                                await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: `Gagal mengunggah audio dari status audio dari *${senderName}* (${displaySendernumber}).` });
                            }
                        } else {
                            messageContent = `Status teks dari *${senderName}* (${displaySendernumber}) telah dilihat ${autoLikeStatus ? "dan disukai" : ""} dengan caption: "*${caption}*"`;
    
                            await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: messageContent });
                        }
                    } else {
                        await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: messageContent });
                    }
                }
            } 
	}
    });
}

connectToWhatsApp();
