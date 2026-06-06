/*
  Warnings:

  - You are about to drop the column `isActive` on the `prescriptions` table. All the data in the column will be lost.
  - You are about to drop the column `medications` on the `prescriptions` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PRESCRIPTION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESCRIPTION_RENEWAL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESCRIPTION_RENEWAL_REJECTED';

-- AlterEnum
ALTER TYPE "PrescriptionAction" ADD VALUE 'VIEW';

-- AlterTable
ALTER TABLE "prescription_templates" ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "prescriptions" DROP COLUMN "isActive",
DROP COLUMN "medications",
ADD COLUMN     "isRenewal" BOOLEAN NOT NULL DEFAULT false;
