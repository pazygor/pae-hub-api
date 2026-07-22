-- Atribuição de treinamento com estado PENDENTE: datas nulas = atribuído/não-concluído.
-- Não-destrutivo: registros existentes (conclusões reais) mantêm as datas.
ALTER TABLE "user_trainings" ALTER COLUMN "completedDate" DROP NOT NULL;
ALTER TABLE "user_trainings" ALTER COLUMN "expiryDate" DROP NOT NULL;
