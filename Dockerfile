# ─────────────────────────────────────────────────────────────────────────────
# M1 PAE Hub — API (NestJS + Prisma + PostgreSQL)
# Imagem única: no build gera o Prisma Client e compila o TypeScript (dist) via
# tsconfig.build.json (exclui testes). No start roda migrate deploy + seed e sobe
# a partir do dist compilado (node dist/main).
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app

# openssl é requerido pelo Prisma; ca-certificates para TLS.
# ffmpeg: normaliza áudio para AAC/mp4 no upload — o WebKit (Safari/iOS) não
# decodifica webm/opus, que é o que o Chrome grava.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Instala dependências (usa cache de camada enquanto package*.json não muda)
COPY package*.json ./
RUN npm ci

# Copia o código, gera o Prisma Client e compila o TypeScript (dist).
# O `prisma generate` carrega o prisma.config.ts, que exige DATABASE_URL; como
# generate NÃO conecta no banco, passamos uma URL placeholder só nesse passo.
# A DATABASE_URL real entra em runtime (via docker-compose).
COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" npx prisma generate \
  && npm run build

# Script de inicialização: migrate deploy (+ seed opcional) e sobe a API
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
