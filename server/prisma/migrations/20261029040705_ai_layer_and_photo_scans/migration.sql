-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'processing', 'done', 'failed');

-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "extracted" JSONB,
ADD COLUMN     "failure_code" VARCHAR(40),
ADD COLUMN     "image_hash" CHAR(64),
ADD COLUMN     "llm_provider" VARCHAR(20),
ADD COLUMN     "status" "ScanStatus" NOT NULL DEFAULT 'done',
ALTER COLUMN "verdict" DROP NOT NULL,
ALTER COLUMN "risk_score" DROP NOT NULL,
ALTER COLUMN "confidence" DROP NOT NULL;

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "task" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "system" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_audit_logs" (
    "id" UUID NOT NULL,
    "task" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "prompt_version" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error_code" VARCHAR(40),
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "input_summary" VARCHAR(500) NOT NULL,
    "output_summary" VARCHAR(1000),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "scan_id" UUID,
    "correlation_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_task_version_key" ON "prompt_versions"("task", "version");

-- CreateIndex
CREATE INDEX "ai_audit_logs_created_at_idx" ON "ai_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_audit_logs_task_created_at_idx" ON "ai_audit_logs"("task", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_audit_logs_scan_id_idx" ON "ai_audit_logs"("scan_id");

-- AddForeignKey
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
