-- AlterTable
ALTER TABLE "users" ADD COLUMN     "entityId" TEXT;

-- CreateIndex
CREATE INDEX "users_entityId_idx" ON "users"("entityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
