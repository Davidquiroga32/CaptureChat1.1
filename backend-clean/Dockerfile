FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 8080

CMD ["sh", "-c", "npx prisma db push --skip-generate && exec node server.js"]
