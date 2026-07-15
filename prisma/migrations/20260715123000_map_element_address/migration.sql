-- AlterTable
ALTER TABLE "map_elements" ADD COLUMN     "cep" VARCHAR(9),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "neighborhood" VARCHAR(120),
ADD COLUMN     "number" VARCHAR(20),
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "street" VARCHAR(255);
