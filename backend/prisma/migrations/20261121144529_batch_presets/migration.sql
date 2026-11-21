-- AlterTable
ALTER TABLE "GenerationBatch" ADD COLUMN     "presetValues" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sendOnComplete" TEXT;
