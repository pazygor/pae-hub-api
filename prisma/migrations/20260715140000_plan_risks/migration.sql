-- CreateTable
CREATE TABLE "plan_risks" (
    "planId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "plan_risks_pkey" PRIMARY KEY ("planId","riskId")
);

-- CreateIndex
CREATE INDEX "plan_risks_riskId_idx" ON "plan_risks"("riskId");

-- AddForeignKey
ALTER TABLE "plan_risks" ADD CONSTRAINT "plan_risks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "emergency_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_risks" ADD CONSTRAINT "plan_risks_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
