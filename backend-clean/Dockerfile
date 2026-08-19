FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY backend-clean/package.json backend-clean/package-lock.json ./
COPY backend-clean/prisma ./prisma

RUN npm ci

COPY backend-clean/ .
COPY frontend/ ./public

RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 8080

CMD ["sh", "-c", "npx prisma db push --skip-generate && exec node server.js"]
