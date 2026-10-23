-- CreateEnum
CREATE TYPE "TokenRevokeReason" AS ENUM ('rotated', 'session_reset', 'reuse_detected');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "revoked_reason" "TokenRevokeReason";
