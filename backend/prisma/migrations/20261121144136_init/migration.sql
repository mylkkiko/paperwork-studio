-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'editor', 'coordinator');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('student_agreement', 'termination_act', 'enrollment_letter', 'vacation_order', 'partner_invoice');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('core', 'manual', 'system');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'date', 'money', 'number');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('student', 'staff', 'partner');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('created', 'sent', 'viewed', 'signed', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('online', 'paper');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('auto', 'manual');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "filePath" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "clauses" JSONB NOT NULL,
    "comparison" JSONB,
    "comparedToId" TEXT,
    "changeSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" "FieldSource" NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'text',
    "format" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MergeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationBatch" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "recipientType" "RecipientType" NOT NULL,
    "groupId" TEXT,
    "groupName" TEXT,
    "commonValues" JSONB NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "excludedIds" JSONB NOT NULL DEFAULT '[]',
    "recipientIds" JSONB NOT NULL DEFAULT '[]',
    "status" "BatchStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "zipPath" TEXT,
    "mergedPdfPath" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "recipientType" "RecipientType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "groupId" TEXT,
    "dataSnapshot" JSONB NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "docxPath" TEXT NOT NULL,
    "signedPdfPath" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'created',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "scanPath" TEXT,
    "recordedById" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "scheduleDay" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_idx" ON "TemplateVersion"("templateId");

-- CreateIndex
CREATE INDEX "TemplateVersion_status_idx" ON "TemplateVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_versionNumber_key" ON "TemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MergeField_key_key" ON "MergeField"("key");

-- CreateIndex
CREATE INDEX "GenerationBatch_templateVersionId_idx" ON "GenerationBatch"("templateVersionId");

-- CreateIndex
CREATE INDEX "GenerationBatch_groupId_idx" ON "GenerationBatch"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_number_key" ON "Document"("number");

-- CreateIndex
CREATE INDEX "Document_batchId_idx" ON "Document"("batchId");

-- CreateIndex
CREATE INDEX "Document_templateVersionId_idx" ON "Document"("templateVersionId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_groupId_idx" ON "Document"("groupId");

-- CreateIndex
CREATE INDEX "Document_recipientId_idx" ON "Document"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_tokenHash_key" ON "SignatureRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "SignatureRequest_documentId_idx" ON "SignatureRequest"("documentId");

-- CreateIndex
CREATE INDEX "Signature_documentId_idx" ON "Signature"("documentId");

-- CreateIndex
CREATE INDEX "Reminder_documentId_idx" ON "Reminder"("documentId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationBatch" ADD CONSTRAINT "GenerationBatch_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
