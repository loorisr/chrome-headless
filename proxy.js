const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');

const TARGET_PORT = 9223; // Port réel de Chromium
const PROXY_PORT = 9222;  // Port exposé vers l'extérieur

const proxy = httpProxy.createProxyServer({ 
    target: { host: '127.0.0.1', port: TARGET_PORT }, 
    ws: true 
});

// Serveur pour les requêtes HTTP (ex: /json/list)
const server = http.createServer((req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    proxy.web(req, res, (err) => {
        console.error(`[HTTP ERROR] ${err.message}`);
        res.writeHead(502);
        res.end("Chromium n'est pas prêt.");
    });
});

// Gestion des WebSockets (CDP)
server.on('upgrade', async (req, socket, head) => {
    console.log(`[WS] Requête entrante sur : ${req.url}`);

    if (req.url === '/chrome') {
        try {
            console.log(`[DEBUG] Récupération de l'ID de session via http://127.0.0.1:${TARGET_PORT}/json/version...`);
            const response = await axios.get(`http://127.0.0.1:${TARGET_PORT}/json/version`);
            
            const wsUrl = response.data.webSocketDebuggerUrl;
            // Extrait l'identifiant unique (/devtools/browser/...)
            const dynamicPath = wsUrl.replace(`ws://127.0.0.1:${TARGET_PORT}`, '');
            
            console.log(`[DEBUG] URL Dynamique trouvée : ${dynamicPath}`);
            console.log(`[WS] Redirection : /chrome -> ${dynamicPath}`);

            req.url = dynamicPath;
            proxy.ws(req, socket, head);
        } catch (e) {
            console.error(`[ERROR] Impossible de joindre Chromium : ${e.message}`);
            socket.destroy();
        }
    } else {
        // Pour les autres chemins (si Playwright essaie l'URL directe)
        console.log(`[WS] Proxy direct pour : ${req.url}`);
        proxy.ws(req, socket, head);
    }
});

// Gestion des erreurs globale sur le proxy
proxy.on('error', (err, req, res) => {
    console.error(`[PROXY ERROR] : ${err.message}`);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 Proxy CDP Statique démarré sur le port ${PROXY_PORT}`);
    console.log(`🔗 URL statique : ws://localhost:${PROXY_PORT}/chrome`);
    console.log(`--------------------------------------------------`);
});
