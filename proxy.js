const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');
const url = require('url');

const TARGET = 'http://127.0.0.1:9223';
const PROXY_PORT = 9222;
const AUTH_TOKEN = process.env.CHROME_TOKEN || 'chrome_token'; // 'chrome_token' par défaut

const proxy = httpProxy.createProxyServer({ target: TARGET, ws: true });

const server = http.createServer((req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    proxy.web(req, res);
});

server.on('upgrade', async (req, socket, head) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const token = parsedUrl.query.token;

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
    console.log(`📍 URL : ws://localhost:${PROXY_PORT}/chrome?token=${AUTH_TOKEN}`);
    console.log(`================================================`);
});
