-- CreateTable
CREATE TABLE "trainings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "materialFileName" VARCHAR(255),
    "videoUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_trainings" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "certificate" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "epiType" VARCHAR(30) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_epis" (
    "id" TEXT NOT NULL,
    "epiId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "responsible" VARCHAR(255),
    "observations" TEXT,
    "usageStatus" VARCHAR(20) NOT NULL DEFAULT 'em_uso',
    "returnDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_epis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "responsible" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'conforme',
    "expiryDate" TIMESTAMP(3),
    "userId" TEXT,
    "notes" TEXT,
    "area" VARCHAR(100),
    "verificationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainings_organizationId_idx" ON "trainings"("organizationId");

-- CreateIndex
CREATE INDEX "user_trainings_trainingId_idx" ON "user_trainings"("trainingId");

-- CreateIndex
CREATE INDEX "user_trainings_userId_idx" ON "user_trainings"("userId");

-- CreateIndex
CREATE INDEX "epis_organizationId_idx" ON "epis"("organizationId");

-- CreateIndex
CREATE INDEX "user_epis_epiId_idx" ON "user_epis"("epiId");

-- CreateIndex
CREATE INDEX "user_epis_userId_idx" ON "user_epis"("userId");

-- CreateIndex
CREATE INDEX "compliance_items_organizationId_idx" ON "compliance_items"("organizationId");

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trainings" ADD CONSTRAINT "user_trainings_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trainings" ADD CONSTRAINT "user_trainings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epis" ADD CONSTRAINT "epis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_epis" ADD CONSTRAINT "user_epis_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "epis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_epis" ADD CONSTRAINT "user_epis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
