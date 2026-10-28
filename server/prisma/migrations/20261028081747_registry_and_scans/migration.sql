-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "RegistrySource" AS ENUM ('greenbook', 'pack_label', 'nafdac_alert', 'demo');

-- CreateEnum
CREATE TYPE "ScanKind" AS ENUM ('manual', 'photo');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('likely_genuine', 'suspicious', 'high_risk', 'unregistered');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "nafdac_no" VARCHAR(20) NOT NULL,
    "brand_name" VARCHAR(120) NOT NULL,
    "generic_name" VARCHAR(200) NOT NULL,
    "strength" VARCHAR(80),
    "dosage_form" VARCHAR(60),
    "manufacturer" VARCHAR(160),
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "source" "RegistrySource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_no" VARCHAR(40) NOT NULL,
    "mfg_date" DATE,
    "expiry_date" DATE,
    "recalled" BOOLEAN NOT NULL DEFAULT false,
    "recall_note" TEXT,
    "source" "RegistrySource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "device_id" UUID,
    "kind" "ScanKind" NOT NULL,
    "nafdac_no" VARCHAR(20),
    "product_name" VARCHAR(200),
    "batch_no" VARCHAR(40),
    "expiry_date" DATE,
    "product_id" UUID,
    "verdict" "Verdict" NOT NULL,
    "risk_score" SMALLINT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_nafdac_no_key" ON "products"("nafdac_no");

-- CreateIndex
CREATE INDEX "products_brand_name_trgm_idx" ON "products" USING GIN ("brand_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_generic_name_trgm_idx" ON "products" USING GIN ("generic_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "batches_product_id_batch_no_key" ON "batches"("product_id", "batch_no");

-- CreateIndex
CREATE INDEX "scans_device_id_created_at_idx" ON "scans"("device_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scans_nafdac_no_batch_no_idx" ON "scans"("nafdac_no", "batch_no");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
