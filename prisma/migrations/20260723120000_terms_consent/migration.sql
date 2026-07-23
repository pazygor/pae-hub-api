-- Item 6 — Termo de Consentimento: gating no User + log imutável de aceites.

-- AlterTable: campos de gating rápido no usuário (não-destrutivo, nullable)
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "termsVersion" VARCHAR(20);

-- CreateTable: log append-only (1 linha por aceite)
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" VARCHAR(20) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terms_acceptances_userId_idx" ON "terms_acceptances"("userId");

ALTER TABLE "terms_acceptances"
  ADD CONSTRAINT "terms_acceptances_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
