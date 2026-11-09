FROM ghcr.io/puppeteer/puppeteer:22.6.0

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=3000 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

EXPOSE 3000

CMD ["node", "bot.js"]
