# ─────────────────────────────────────────────────────────────────────────────
# M1 PAE Hub — API (NestJS + Prisma + PostgreSQL)
# A API roda via ts-node --transpile-only (mesmo modo do dev): transpila sem
# type-check, evitando os erros de tipagem estrita que travam o `tsc`. No build
# só geramos o Prisma Client; migrate deploy + seed acontecem no start.
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

# Copia o código e gera o Prisma Client.
# O `prisma generate` carrega o prisma.config.ts, que exige DATABASE_URL; como
# generate NÃO conecta no banco, passamos uma URL placeholder só nesse passo.
# A DATABASE_URL real entra em runtime (via docker-compose).
COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" npx prisma generate

# Script de inicialização: migrate deploy (+ seed opcional) e sobe a API
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
