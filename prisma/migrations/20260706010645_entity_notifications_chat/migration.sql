-- CreateTable
CREATE TABLE "entity_notifications" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Notificada',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "respondingAt" TIMESTAMP(3),
    "dispatchedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_notifications_occurrenceId_idx" ON "entity_notifications"("occurrenceId");

-- CreateIndex
CREATE INDEX "entity_notifications_entityId_idx" ON "entity_notifications"("entityId");

-- CreateIndex
CREATE INDEX "chat_messages_occurrenceId_idx" ON "chat_messages"("occurrenceId");

-- AddForeignKey
ALTER TABLE "entity_notifications" ADD CONSTRAINT "entity_notifications_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_notifications" ADD CONSTRAINT "entity_notifications_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
