-- CreateEnum
CREATE TYPE "HotspotSeverity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "area_name" VARCHAR(80),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "hotspots" (
    "id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "scan_count" INTEGER NOT NULL,
    "high_risk_count" INTEGER NOT NULL,
    "max_risk_score" INTEGER NOT NULL,
    "recall_involved" BOOLEAN NOT NULL,
    "severity" "HotspotSeverity" NOT NULL,
    "product_id" UUID,
    "nafdac_no" VARCHAR(20),
    "batch_no" VARCHAR(40),
    "area_name" VARCHAR(80),
    "simulated_share" DOUBLE PRECISION NOT NULL,
    "first_seen" TIMESTAMPTZ(3) NOT NULL,
    "last_seen" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspot_alerts" (
    "id" UUID NOT NULL,
    "hotspot_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(600) NOT NULL,
    "recommended_action" VARCHAR(300) NOT NULL,
    "severity" "HotspotSeverity" NOT NULL,
    "generated_by" VARCHAR(20) NOT NULL,
    "prompt_version" INTEGER,
    "facts" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotspot_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotspots_active_severity_idx" ON "hotspots"("active", "severity");

-- CreateIndex
CREATE INDEX "hotspot_alerts_created_at_idx" ON "hotspot_alerts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "scans_created_at_risk_score_idx" ON "scans"("created_at" DESC, "risk_score");

-- AddForeignKey
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_alerts" ADD CONSTRAINT "hotspot_alerts_hotspot_id_fkey" FOREIGN KEY ("hotspot_id") REFERENCES "hotspots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
