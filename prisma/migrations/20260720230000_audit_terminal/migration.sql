-- Auditoria (item 2): terminal do recurso na trilha, para filtro/coluna Terminal.
ALTER TABLE "audit_logs" ADD COLUMN "terminalId" VARCHAR(100);
CREATE INDEX "audit_logs_terminalId_idx" ON "audit_logs"("terminalId");
