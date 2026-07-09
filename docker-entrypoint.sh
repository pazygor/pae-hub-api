#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Inicialização da API dentro do container:
#   1) aplica as migrations no banco (idempotente)
#   2) roda o seed apenas se RUN_SEED=true (primeira subida)
#   3) sobe o NestJS compilado
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "▶ Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "▶ RUN_SEED=true — executando seed..."
  npm run prisma:seed || echo "⚠ seed falhou ou já aplicado — seguindo."
fi

echo "▶ Iniciando API..."
exec node dist/main
