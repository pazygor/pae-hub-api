-- AlterTable: pacotes/módulos por terminal (item 7). Defaults = "tudo ligado"
-- (compatível com o comportamento atual). Conformidade é derivada, não armazenada.
ALTER TABLE "terminals"
  ADD COLUMN "activeModules" TEXT[] NOT NULL DEFAULT ARRAY['emergency_management','operational_safety']::TEXT[],
  ADD COLUMN "activeSafetySubModules" TEXT[] NOT NULL DEFAULT ARRAY['trainings','epis']::TEXT[];
