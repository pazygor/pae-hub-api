-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OccurrenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OccurrenceCriticality" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY', 'CRISIS');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OccurrenceType" AS ENUM ('FIRE', 'MEDICAL', 'OPERATIONAL', 'ENVIRONMENTAL', 'SECURITY', 'STRUCTURAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SYSTEM', 'OPERATIONAL', 'SAFETY', 'ENVIRONMENTAL', 'SECURITY', 'THRESHOLD', 'MANUAL');

-- CreateEnum
CREATE TYPE "WarRoomStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENT', 'EVIDENCE_ADDED', 'ALERT_LINKED', 'WAR_ROOM_OPENED', 'WAR_ROOM_CLOSED', 'CHECKLIST_UPDATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "SafetyItemType" AS ENUM ('EPI', 'TRAINING', 'INSPECTION', 'PROCEDURE', 'INCIDENT');

-- CreateEnum
CREATE TYPE "SafetyItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiInsightSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AiAgentType" AS ENUM ('MONITOR', 'RCA', 'SLA', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "KnowledgeEntryType" AS ENUM ('RCA', 'LESSON_LEARNED', 'RECOMMENDATION', 'PROCEDURE', 'ANALYSIS', 'MANUAL');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "logoUrl" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "terminalId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'terminal',
    "accessLevel" VARCHAR(20),
    "tacticalManagerId" TEXT,
    "allowedModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedTerminals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedOccurrenceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatarUrl" VARCHAR(500),
    "phone" VARCHAR(50),
    "department" VARCHAR(100),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_types" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(20),
    "icon" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrences" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "terminalId" TEXT NOT NULL,
    "emergencyTypeId" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "OccurrenceType" NOT NULL DEFAULT 'OPERATIONAL',
    "severity" "OccurrenceSeverity" NOT NULL DEFAULT 'MEDIUM',
    "criticality" "OccurrenceCriticality" NOT NULL DEFAULT 'URGENT',
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "location" VARCHAR(255),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "reportedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "slaDeadline" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_timeline" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "TimelineEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "type" "EvidenceType" NOT NULL DEFAULT 'PHOTO',
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageUrl" VARCHAR(1000) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" VARCHAR(255),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "type" "AlertType" NOT NULL DEFAULT 'OPERATIONAL',
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(100),
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "war_rooms" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" "WarRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "war_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "war_room_participants" (
    "id" TEXT NOT NULL,
    "warRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "war_room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "war_room_messages" (
    "id" TEXT NOT NULL,
    "warRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "war_room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "war_room_decisions" (
    "id" TEXT NOT NULL,
    "warRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "war_room_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_items" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT,
    "assignedToId" TEXT,
    "type" "SafetyItemType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "SafetyItemStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(100),
    "details" JSONB,
    "ipAddress" VARCHAR(50),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "occurrenceId" TEXT,
    "agentType" "AiAgentType" NOT NULL,
    "insightType" VARCHAR(64) NOT NULL,
    "severity" "AiInsightSeverity" NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "occurrenceId" TEXT,
    "type" "KnowledgeEntryType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "promptKey" VARCHAR(64) NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "variables" TEXT[],
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_evaluations" (
    "id" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "analysisType" VARCHAR(64) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "inputHash" VARCHAR(64),
    "outputHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_organizationId_code_key" ON "terminals"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_terminalId_idx" ON "users"("terminalId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_types_code_key" ON "emergency_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "occurrences_code_key" ON "occurrences"("code");

-- CreateIndex
CREATE INDEX "occurrences_terminalId_idx" ON "occurrences"("terminalId");

-- CreateIndex
CREATE INDEX "occurrences_status_idx" ON "occurrences"("status");

-- CreateIndex
CREATE INDEX "occurrences_severity_idx" ON "occurrences"("severity");

-- CreateIndex
CREATE INDEX "occurrences_createdAt_idx" ON "occurrences"("createdAt");

-- CreateIndex
CREATE INDEX "occurrence_timeline_occurrenceId_idx" ON "occurrence_timeline"("occurrenceId");

-- CreateIndex
CREATE INDEX "evidences_occurrenceId_idx" ON "evidences"("occurrenceId");

-- CreateIndex
CREATE INDEX "checklist_items_occurrenceId_idx" ON "checklist_items"("occurrenceId");

-- CreateIndex
CREATE INDEX "alerts_terminalId_idx" ON "alerts"("terminalId");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");

-- CreateIndex
CREATE INDEX "war_rooms_occurrenceId_idx" ON "war_rooms"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "war_room_participants_warRoomId_userId_key" ON "war_room_participants"("warRoomId", "userId");

-- CreateIndex
CREATE INDEX "war_room_messages_warRoomId_idx" ON "war_room_messages"("warRoomId");

-- CreateIndex
CREATE INDEX "war_room_decisions_warRoomId_idx" ON "war_room_decisions"("warRoomId");

-- CreateIndex
CREATE INDEX "safety_items_terminalId_idx" ON "safety_items"("terminalId");

-- CreateIndex
CREATE INDEX "safety_items_status_idx" ON "safety_items"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "agent_insights_occurrenceId_idx" ON "agent_insights"("occurrenceId");

-- CreateIndex
CREATE INDEX "agent_insights_agentType_idx" ON "agent_insights"("agentType");

-- CreateIndex
CREATE INDEX "knowledge_entries_type_idx" ON "knowledge_entries"("type");

-- CreateIndex
CREATE INDEX "prompt_versions_promptKey_idx" ON "prompt_versions"("promptKey");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_promptKey_version_key" ON "prompt_versions"("promptKey", "version");

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tacticalManagerId_fkey" FOREIGN KEY ("tacticalManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_emergencyTypeId_fkey" FOREIGN KEY ("emergencyTypeId") REFERENCES "emergency_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_timeline" ADD CONSTRAINT "occurrence_timeline_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_timeline" ADD CONSTRAINT "occurrence_timeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_rooms" ADD CONSTRAINT "war_rooms_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_participants" ADD CONSTRAINT "war_room_participants_warRoomId_fkey" FOREIGN KEY ("warRoomId") REFERENCES "war_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_participants" ADD CONSTRAINT "war_room_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_messages" ADD CONSTRAINT "war_room_messages_warRoomId_fkey" FOREIGN KEY ("warRoomId") REFERENCES "war_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_messages" ADD CONSTRAINT "war_room_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_decisions" ADD CONSTRAINT "war_room_decisions_warRoomId_fkey" FOREIGN KEY ("warRoomId") REFERENCES "war_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "war_room_decisions" ADD CONSTRAINT "war_room_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_items" ADD CONSTRAINT "safety_items_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_evaluations" ADD CONSTRAINT "prompt_evaluations_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_evaluations" ADD CONSTRAINT "prompt_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
