-- Alertas perdidos (re-hidratação no login): marca do último "visto" dos
-- alertas de ocorrência por usuário. NULL = nunca marcou (alerta tudo não resolvido).
ALTER TABLE "users" ADD COLUMN "alertsSeenAt" TIMESTAMP(3);
