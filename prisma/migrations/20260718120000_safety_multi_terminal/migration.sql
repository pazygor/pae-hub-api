-- Treinamentos/EPIs/Conformidade passam a se aplicar a MÚLTIPLOS terminais
-- (registro compartilhado). Migra terminalId (único) -> terminalIds (lista).
-- Vazio = global (todos). Sem FK (terminalId era escalar).

-- Trainings
ALTER TABLE "trainings" ADD COLUMN "terminalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "trainings" SET "terminalIds" = ARRAY["terminalId"] WHERE "terminalId" IS NOT NULL;
ALTER TABLE "trainings" DROP COLUMN "terminalId";

-- EPIs
ALTER TABLE "epis" ADD COLUMN "terminalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "epis" SET "terminalIds" = ARRAY["terminalId"] WHERE "terminalId" IS NOT NULL;
ALTER TABLE "epis" DROP COLUMN "terminalId";

-- Compliance
ALTER TABLE "compliance_items" ADD COLUMN "terminalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "compliance_items" SET "terminalIds" = ARRAY["terminalId"] WHERE "terminalId" IS NOT NULL;
ALTER TABLE "compliance_items" DROP COLUMN "terminalId";
