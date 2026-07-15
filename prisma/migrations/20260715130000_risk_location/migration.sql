-- AlterTable
ALTER TABLE "risks" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "cep" VARCHAR(9),
ADD COLUMN     "street" VARCHAR(255),
ADD COLUMN     "number" VARCHAR(20),
ADD COLUMN     "neighborhood" VARCHAR(120),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "state" VARCHAR(2);
