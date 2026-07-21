-- Item 4 — documento PAE aponta para um FileAsset (upload real).
ALTER TABLE "pae_documents" ADD COLUMN "fileId" TEXT;
