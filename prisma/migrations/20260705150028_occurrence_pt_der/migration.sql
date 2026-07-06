-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 — Remodelagem da Occurrence para o vocabulário pt-BR/DER (plano §4.2).
-- Migration escrita à mão para PRESERVAR os dados existentes:
--   • enums ingleses do Manus → Strings pt-BR (CASE por valor);
--   • code (OCC-…) → incNumber (INC-####) renumerado por organização;
--   • organizationId backfilled via terminal; contador atômico na organização;
--   • extras do Manus (title, emergencyTypeId, assignedToUserId, slaDeadline,
--     closedAt) removidos; responsible herdado do assignedTo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Organização: contador do INC-#### sequencial
ALTER TABLE "organizations" ADD COLUMN "occurrenceSeq" INTEGER NOT NULL DEFAULT 0;

-- 2) Occurrence: novas colunas (nullable para backfill)
ALTER TABLE "occurrences" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "occurrences" ADD COLUMN "incNumber" VARCHAR(20);
ALTER TABLE "occurrences" ADD COLUMN "responsible" VARCHAR(255);
ALTER TABLE "occurrences" ADD COLUMN "team" VARCHAR(255);

-- 3) Backfills
UPDATE "occurrences" o
SET "organizationId" = t."organizationId"
FROM "terminals" t
WHERE o."terminalId" = t."id";

WITH numbered AS (
  SELECT "id",
         'INC-' || LPAD((ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt"))::text, 4, '0') AS inc
  FROM "occurrences"
)
UPDATE "occurrences" o
SET "incNumber" = n.inc
FROM numbered n
WHERE o."id" = n."id";

UPDATE "occurrences" o
SET "responsible" = u."name"
FROM "users" u
WHERE o."assignedToUserId" = u."id";

UPDATE "organizations" org
SET "occurrenceSeq" = COALESCE((SELECT COUNT(*)::int FROM "occurrences" o WHERE o."organizationId" = org."id"), 0);

-- 4) Constraints e índices novos
ALTER TABLE "occurrences" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "occurrences" ALTER COLUMN "incNumber" SET NOT NULL;
CREATE UNIQUE INDEX "occurrences_organizationId_incNumber_key" ON "occurrences"("organizationId", "incNumber");
CREATE INDEX "occurrences_organizationId_idx" ON "occurrences"("organizationId");
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Enums → VARCHAR pt-BR (preservando os valores existentes)
ALTER TABLE "occurrences" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "occurrences" ALTER COLUMN "status" TYPE VARCHAR(30) USING (
  CASE "status"::text
    WHEN 'OPEN'         THEN 'aberto'
    WHEN 'IN_PROGRESS'  THEN 'em atendimento'
    WHEN 'RESOLVED'     THEN 'resolvido'
    WHEN 'CLOSED'       THEN 'resolvido'
    WHEN 'CANCELLED'    THEN 'resolvido'
    ELSE 'aberto'
  END);
ALTER TABLE "occurrences" ALTER COLUMN "status" SET DEFAULT 'aberto';

ALTER TABLE "occurrences" ALTER COLUMN "criticality" DROP DEFAULT;
ALTER TABLE "occurrences" ALTER COLUMN "criticality" TYPE VARCHAR(20) USING (
  CASE "criticality"::text
    WHEN 'ROUTINE'   THEN 'baixa'
    WHEN 'URGENT'    THEN 'média'
    WHEN 'EMERGENCY' THEN 'alta'
    WHEN 'CRISIS'    THEN 'crítica'
    ELSE 'média'
  END);
ALTER TABLE "occurrences" ALTER COLUMN "criticality" SET DEFAULT 'média';

ALTER TABLE "occurrences" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "occurrences" ALTER COLUMN "severity" TYPE VARCHAR(20) USING (
  CASE "severity"::text
    WHEN 'LOW'      THEN 'baixa'
    WHEN 'MEDIUM'   THEN 'média'
    WHEN 'HIGH'     THEN 'alta'
    WHEN 'CRITICAL' THEN 'alta'
    ELSE NULL
  END);
ALTER TABLE "occurrences" ALTER COLUMN "severity" DROP NOT NULL;

ALTER TABLE "occurrences" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "occurrences" ALTER COLUMN "type" TYPE VARCHAR(100) USING (
  CASE "type"::text
    WHEN 'FIRE'          THEN 'Princípio de incêndio'
    WHEN 'MEDICAL'       THEN 'Acidente de trabalho'
    WHEN 'ENVIRONMENTAL' THEN 'Contaminação ambiental'
    ELSE 'Outros'
  END);

-- Timeline: eventos tipados pt-BR + attachment
ALTER TABLE "occurrence_timeline" ADD COLUMN "attachment" VARCHAR(255);
ALTER TABLE "occurrence_timeline" ALTER COLUMN "eventType" TYPE VARCHAR(50) USING (
  CASE "eventType"::text
    WHEN 'CREATED'        THEN 'ocorrência registrada'
    WHEN 'STATUS_CHANGED' THEN 'atualização de status'
    WHEN 'ASSIGNED'       THEN 'equipe acionada'
    WHEN 'RESOLVED'       THEN 'ocorrência resolvida'
    WHEN 'CLOSED'         THEN 'ocorrência resolvida'
    ELSE 'ação executada'
  END);

-- Evidence: só-metadados (storage opcional) + tipo pt-BR
ALTER TABLE "evidences" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "evidences" ALTER COLUMN "type" TYPE VARCHAR(30) USING (
  CASE "type"::text
    WHEN 'PHOTO'    THEN 'foto'
    WHEN 'VIDEO'    THEN 'vídeo'
    WHEN 'DOCUMENT' THEN 'documento'
    WHEN 'AUDIO'    THEN 'áudio'
    ELSE 'outro'
  END);
ALTER TABLE "evidences" ALTER COLUMN "type" SET DEFAULT 'documento';
ALTER TABLE "evidences" ALTER COLUMN "originalName" DROP NOT NULL;
ALTER TABLE "evidences" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "evidences" ALTER COLUMN "sizeBytes" DROP NOT NULL;
ALTER TABLE "evidences" ALTER COLUMN "storageKey" DROP NOT NULL;
ALTER TABLE "evidences" ALTER COLUMN "storageUrl" DROP NOT NULL;

-- 6) Remoção dos extras do Manus
ALTER TABLE "occurrences" DROP CONSTRAINT IF EXISTS "occurrences_emergencyTypeId_fkey";
ALTER TABLE "occurrences" DROP CONSTRAINT IF EXISTS "occurrences_assignedToUserId_fkey";
DROP INDEX IF EXISTS "occurrences_severity_idx";
ALTER TABLE "occurrences" DROP COLUMN "code";
ALTER TABLE "occurrences" DROP COLUMN "title";
ALTER TABLE "occurrences" DROP COLUMN "emergencyTypeId";
ALTER TABLE "occurrences" DROP COLUMN "assignedToUserId";
ALTER TABLE "occurrences" DROP COLUMN "slaDeadline";
ALTER TABLE "occurrences" DROP COLUMN "closedAt";

-- 7) Tipos enum que deixaram de existir
DROP TYPE "OccurrenceStatus";
DROP TYPE "OccurrenceSeverity";
DROP TYPE "OccurrenceCriticality";
DROP TYPE "OccurrenceType";
DROP TYPE "TimelineEventType";
DROP TYPE "EvidenceType";
