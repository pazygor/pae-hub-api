# ─────────────────────────────────────────────────────────────────────────────
# M1 PAE Hub — API (NestJS + Prisma + PostgreSQL)
# Imagem única: build (tsc + prisma generate) e runtime no mesmo estágio, pois
# o start executa `prisma migrate deploy` e o seed (ts-node) — precisa das deps.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app

# openssl é requerido pelo Prisma; ca-certificates para TLS
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instala dependências (usa cache de camada enquanto package*.json não muda)
COPY package*.json ./
RUN npm ci

# Copia o código e gera o client Prisma + compila o TypeScript.
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
