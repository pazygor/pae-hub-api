-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "contact" VARCHAR(100),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "responsible" VARCHAR(255),
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'Ativo';
