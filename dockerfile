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

ENV CHROME_TOKEN=chrome_token
ENV IDLE_TIMEOUT=60

# Exposer le port CDP
EXPOSE 9222

CMD ["node", "proxy.js"]
