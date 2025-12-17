# Image de base légère avec Node.js LTS
FROM node:lts-alpine

# Installation de Chromium et des polices
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Création du dossier pour éviter l'erreur de socket DBus
RUN mkdir -p /var/run/dbus

WORKDIR /app
RUN npm install axios http-proxy
COPY proxy.js .

# Exposer le port CDP
EXPOSE 9222

CMD chromium-browser \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --remote-debugging-port=9223 \
    --remote-debugging-address=127.0.0.1 \
    --disable-dbus \
    --allowed-origins=* \
    & node proxy.js
