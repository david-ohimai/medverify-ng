-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('open', 'claimed', 'decided');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('agree', 'disagree', 'inconclusive');

-- CreateTable
CREATE TABLE "scan_reviews" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'open',
    "priority" SMALLINT NOT NULL,
    "reasons" TEXT[],
    "sla_deadline" TIMESTAMPTZ(3) NOT NULL,
    "escalation_level" SMALLINT NOT NULL DEFAULT 0,
    "image_data" BYTEA,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ(3),
    "decision" "ReviewDecision",
    "reviewed_verdict" "Verdict",
    "reviewer_note" VARCHAR(500),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scan_reviews_scan_id_key" ON "scan_reviews"("scan_id");

-- CreateIndex
CREATE INDEX "scan_reviews_status_priority_sla_deadline_idx" ON "scan_reviews"("status", "priority", "sla_deadline");

-- AddForeignKey
ALTER TABLE "scan_reviews" ADD CONSTRAINT "scan_reviews_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
