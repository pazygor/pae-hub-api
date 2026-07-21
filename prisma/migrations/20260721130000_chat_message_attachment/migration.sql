-- Item 10 (chat rico): a mensagem passa a ser opcional (vira legenda quando há anexo)
-- e ganha um anexo opcional referenciando um FileAsset do item 4. A referência é
-- escalar (sem FK), seguindo o mesmo padrão de Training.materialFileId.
ALTER TABLE "chat_messages" ALTER COLUMN "message" DROP NOT NULL;
ALTER TABLE "chat_messages" ADD COLUMN "fileAssetId" TEXT;
