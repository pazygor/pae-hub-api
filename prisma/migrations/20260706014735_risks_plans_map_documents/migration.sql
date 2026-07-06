-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "level" VARCHAR(10) NOT NULL DEFAULT 'médio',
    "affectedArea" VARCHAR(255),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" VARCHAR(255),
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_elements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "layerType" VARCHAR(30) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pae_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "docType" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "fileName" VARCHAR(255) NOT NULL,
    "uploadedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pae_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risks_organizationId_idx" ON "risks"("organizationId");

-- CreateIndex
CREATE INDEX "risks_terminalId_idx" ON "risks"("terminalId");

-- CreateIndex
CREATE INDEX "emergency_plans_organizationId_idx" ON "emergency_plans"("organizationId");

-- CreateIndex
CREATE INDEX "emergency_plans_terminalId_idx" ON "emergency_plans"("terminalId");

-- CreateIndex
CREATE INDEX "map_elements_organizationId_idx" ON "map_elements"("organizationId");

-- CreateIndex
CREATE INDEX "map_elements_terminalId_idx" ON "map_elements"("terminalId");

-- CreateIndex
CREATE INDEX "pae_documents_organizationId_idx" ON "pae_documents"("organizationId");

-- CreateIndex
CREATE INDEX "pae_documents_terminalId_idx" ON "pae_documents"("terminalId");

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_plans" ADD CONSTRAINT "emergency_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_plans" ADD CONSTRAINT "emergency_plans_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_elements" ADD CONSTRAINT "map_elements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_elements" ADD CONSTRAINT "map_elements_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pae_documents" ADD CONSTRAINT "pae_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pae_documents" ADD CONSTRAINT "pae_documents_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
