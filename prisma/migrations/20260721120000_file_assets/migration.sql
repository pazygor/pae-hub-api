-- Item 4 — storage/uploads: tabela de arquivos + vínculo do material de treinamento.

-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_assets_organizationId_idx" ON "file_assets"("organizationId");

-- AlterTable: material de treinamento agora aponta para um FileAsset (upload real)
ALTER TABLE "trainings" ADD COLUMN "materialFileId" TEXT;
