-- Auditoria de Acesso (item 1): sessão por login (login/logout/duração/ip/dispositivo).
CREATE TABLE "access_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP(3),
    "endReason" VARCHAR(20),
    "ipAddress" VARCHAR(50),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_sessions_userId_idx" ON "access_sessions"("userId");
CREATE INDEX "access_sessions_loginAt_idx" ON "access_sessions"("loginAt");

ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
