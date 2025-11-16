// pair.js
const { makeid } = require('./id'); // your makeid function
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require('pino');
const { Storage } = require('megajs');

const {
    default: Mbuvi_Tech,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

// --- Helpers ---
function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    try {
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

// Upload a file to Mega and return a usable shareable link
async function uploadCredsToMega(credsPath, filename = null) {
    if (!fs.existsSync(credsPath)) throw new Error('creds file not found: ' + credsPath);

    const email = process.env.MEGA_EMAIL;
    const password = process.env.MEGA_PASSWORD;

    if (!email || !password) {
        throw new Error('MEGA_EMAIL and MEGA_PASSWORD environment variables are required for Mega upload.');
    }

    // initialize storage
    const storage = new Storage({ email, password });
    await storage.ready;

    const stats = fs.statSync(credsPath);
    const size = stats.size;
    filename = filename || path.basename(credsPath);

    // upload stream
    const uploadResult = await storage.upload({ name: filename, size }, fs.createReadStream(credsPath)).complete;

    // file node and shareable link
    const fileNode = storage.files[uploadResult.nodeId];
    const shareable = await fileNode.link(); // typically returns https://mega.nz/file/<FILE_ID>#<KEY>
    return shareable;
}

// Extract short id after https://mega.nz/file/ if possible
function megaShortIdFromUrl(url) {
    if (!url) return url;
    try {
        // common pattern: https://mega.nz/file/<id>#<key>
        const match = url.match(/https?:\/\/mega\.nz\/file\/([^#\/?]+)(?:#.*)?/);
        if (match && match[1]) return match[1];
        // fallback: return entire url base64 for uniqueness
        return Buffer.from(url).toString('base64').slice(0, 48);
    } catch (e) {
        return url;
    }
}

// --- Route ---
router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number || '';
    const customLabel = "NECTOR01"; // keep your custom label from first script

    async function Mbuvi_MD_PAIR_CODE() {
        // create temp folder early to avoid race conditions
        const tempDir = path.join(__dirname, 'temp', id);
        try {
            // ensure directory exists (useMultiFileAuthState will create it, but ensure parent exists)
            fs.mkdirSync(tempDir, { recursive: true });
        } catch (e) {}

        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            let Mbuvi_MD = Mbuvi_Tech({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
                },
                version: [2, 3000, 1025190524],
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                browser: Browsers.windows('Edge')
            });

            // only request pairing if not already registered
            if (!Mbuvi_MD.authState.creds.registered) {
                await delay(1500);
                num = (num || '').replace(/[^0-9]/g, '');
                if (!num) {
                    if (!res.headersSent) res.status(400).send({ error: 'Missing number parameter.' });
                    return;
                }

                const code = await Mbuvi_MD.requestPairingCode(num, customLabel);
                console.log('Pairing code generated:', code);

                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            Mbuvi_MD.ev.on('creds.update', saveCreds);

            Mbuvi_MD.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                try {
                    if (connection === 'open') {
                        // wait briefly for creds to flush
                        await delay(5000);

                        const credsFile = path.join(__dirname, `temp/${id}/creds.json`);
                        if (!fs.existsSync(credsFile)) {
                            console.error('creds.json not found at expected path:', credsFile);
                            // still try to close socket and cleanup
                            try { await Mbuvi_MD.ws.close(); } catch (e) {}
                            removeFile(path.join(__dirname, 'temp', id));
                            return;
                        }

                        // upload to Mega
                        let megaUrl;
                        try {
                            console.log('Uploading creds to Mega...');
                            megaUrl = await uploadCredsToMega(credsFile, `${id}.json`);
                            console.log('Uploaded creds to Mega:', megaUrl);
                        } catch (err) {
                            console.error('Mega upload failed:', err);
                            // fallback: send base64 session directly to owner (previous behavior)
                            const data = fs.readFileSync(credsFile);
                            const b64data = Buffer.from(data).toString('base64');
                            const fallbackSession = 'nector~' + b64data;
                            await Mbuvi_MD.sendMessage(Mbuvi_MD.user.id, { text: fallbackSession });
                            const fallbackText = `Session uploaded failed to Mega. Sent full base64 session instead.`;
                            await Mbuvi_MD.sendMessage(Mbuvi_MD.user.id, { text: fallbackText });
                            await delay(100);
                            try { await Mbuvi_MD.ws.close(); } catch (e) {}
                            return removeFile(path.join(__dirname, 'temp', id));
                        }

                        // create short session id similar to your second bot: nector~<MEGA_FILE_ID>
                        const shortId = megaShortIdFromUrl(megaUrl);
                        const sid = 'nector~' + shortId;

                        // send short session to bot owner
                        const sessionMessage = await Mbuvi_MD.sendMessage(Mbuvi_MD.user.id, { text: sid });

                        const Mbuvi_MD_TEXT = `
        
╔════════════════════◇
║『 thanks for choosing my Bots』
║ -Set the session ID in Heroku and other panels:
║ - SESSION_ID: ${sid}

║ web: https://vercel-eta-snowy.vercel.app/
╚═════════════════════╝
 _DAVE BOTS_`;

                        await Mbuvi_MD.sendMessage(Mbuvi_MD.user.id, { text: Mbuvi_MD_TEXT }, { quoted: sessionMessage });

                        await delay(100);
                        try { await Mbuvi_MD.ws.close(); } catch (e) {}
                        return removeFile(path.join(__dirname, 'temp', id));
                    } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode != 401) {
                        // reconnect attempt
                        console.log('Connection closed unexpectedly, restarting pair flow...');
                        await delay(10000);
                        Mbuvi_MD_PAIR_CODE();
                    }
                } catch (innerErr) {
                    console.error('Error in connection.update handler:', innerErr);
                    removeFile(path.join(__dirname, 'temp', id));
                }
            });
        } catch (err) {
            console.error('Service restarted (pairing try-catch):', err);
            removeFile(path.join(__dirname, 'temp', id));
            if (!res.headersSent) {
                res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    return await Mbuvi_MD_PAIR_CODE();
});

module.exports = router;
