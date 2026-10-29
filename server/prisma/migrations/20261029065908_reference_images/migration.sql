-- CreateEnum
CREATE TYPE "PackSide" AS ENUM ('front', 'back', 'other');

-- CreateTable
CREATE TABLE "reference_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "side" "PackSide" NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "source" "RegistrySource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_images_sha256_key" ON "reference_images"("sha256");

-- CreateIndex
CREATE INDEX "reference_images_product_id_side_idx" ON "reference_images"("product_id", "side");

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
