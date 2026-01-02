const http = require('http');
const util = require('util');

// Fix [DEP0060] DeprecationWarning: The `util._extend` API is deprecated.
util._extend = Object.assign;

const httpProxy = require('http-proxy');
const axios = require('axios');
const { spawn } = require('child_process');

const TARGET = 'http://127.0.0.1:9223';
const PROXY_PORT = 9222;
const AUTH_TOKEN = process.env.CHROME_TOKEN || 'chrome_token'; // 'chrome_token' par défaut
const envTimeout = parseInt(process.env.IDLE_TIMEOUT);
const IDLE_TIMEOUT = (isNaN(envTimeout) ? 60 : envTimeout) * 1000;

let chromeProcess = null;
let launchPromise = null;
let activityTimeout = null;
let activeConnections = 0;

const launchChrome = () => {
    if (chromeProcess) return Promise.resolve();
    if (launchPromise) return launchPromise;

    console.log('[CHROME] Starting Chromium...');
    launchPromise = new Promise((resolve, reject) => {
        const proc = spawn('chromium-browser', [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--remote-debugging-port=9223',
            '--remote-debugging-address=127.0.0.1',
            '--disable-dbus',
            '--allowed-origins=*'
        ], { detached: true });

        proc.on('error', (err) => {
            console.error(`[CHROME ERROR] ${err.message}`);
            launchPromise = null;
            reject(err);
        });

        proc.on('close', (code) => {
            console.log(`[CHROME] Process exited with code ${code}`);
            chromeProcess = null;
            launchPromise = null;
        });

        let retries = 0;
        const checkInterval = setInterval(() => {
            axios.get(`${TARGET}/json/version`)
                .then(() => {
                    clearInterval(checkInterval);
                    chromeProcess = proc;
                    launchPromise = null;
                    console.log('[CHROME] Ready!');
                    resolve();
                })
                .catch(() => {
                    retries++;
                    if (retries > 50) { // ~10s timeout
                        clearInterval(checkInterval);
                        try {
                            process.kill(-proc.pid);
                        } catch (e) {
                            proc.kill();
                        }
                        launchPromise = null;
                        reject(new Error('Chrome launch timeout'));
                    }
                });
        }, 200);
    });
    return launchPromise;
};

const updateActivity = () => {
    if (activityTimeout) clearTimeout(activityTimeout);
    if (IDLE_TIMEOUT > 0 && activeConnections === 0) {
        activityTimeout = setTimeout(() => {
            if (chromeProcess) {
                console.log(`[CHROME] Inactivity timeout (${IDLE_TIMEOUT}ms). Killing process.`);
                try {
                    process.kill(-chromeProcess.pid);
                } catch (e) {
                    chromeProcess.kill();
                }
                chromeProcess = null;
            }
        }, IDLE_TIMEOUT);
    }
};

const proxy = httpProxy.createProxyServer({ target: TARGET, ws: true });

const server = http.createServer(async (req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    updateActivity();
    try {
        await launchChrome();
        proxy.web(req, res);
    } catch (err) {
        console.error(`[ERROR] Failed to launch Chrome: ${err.message}`);
        res.statusCode = 502;
        res.end('Failed to launch Chrome');
    }
});

server.on('upgrade', async (req, socket, head) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = parsedUrl.pathname;
    const token = parsedUrl.searchParams.get('token');

    console.log(`\n[WS] Handshake sur: ${path}`);

    if (path === '/chrome') {
        // --- VÉRIFICATION DU TOKEN ---
        if (token !== AUTH_TOKEN) {
            console.error(`[AUTH ERROR] Token invalide ou manquant : "${token}"`);
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }

        try {
            await launchChrome();
            activeConnections++;
            updateActivity();
            socket.on('close', () => {
                activeConnections--;
                updateActivity();
            });

            console.log(`[AUTH SUCCESS] Token valide. Recherche de l'ID interne...`);
            const { data } = await axios.get(`${TARGET}/json/version`);
            const internalWsUrl = data.webSocketDebuggerUrl;
            const dynamicPath = new URL(internalWsUrl).pathname;
            
            console.log(`[DEBUG] Redirection: /chrome -> ${dynamicPath}`);
            
            req.url = dynamicPath;
            proxy.ws(req, socket, head);
        } catch (err) {
            console.error(`[CRITICAL] Chromium injoignable: ${err.message}`);
            socket.destroy();
        }
    } else {
        // On bloque aussi les accès directs aux chemins internes sans token 
        // pour forcer le passage par /chrome?token=...
        console.warn(`[BLOCK] Accès direct refusé sur : ${path}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
    }
});

proxy.on('error', (err) => console.error(`[PROXY ERROR] ${err.message}`));

server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`🚀 Proxy Sécurisé actif sur le port ${PROXY_PORT}`);
    console.log(`🔑 Token requis : ${AUTH_TOKEN}`);
    console.log(`⏱️  Timeout inactivité : ${IDLE_TIMEOUT}ms`);
    console.log(`📍 URL : ws://localhost:${PROXY_PORT}/chrome?token=${AUTH_TOKEN}`);
    console.log(`================================================`);
});
