-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrescriptionAction" AS ENUM ('CREATE', 'RENEW', 'EXPIRE', 'CANCEL');

-- DropIndex
DROP INDEX "prescriptions_isActive_idx";

-- DropIndex
DROP INDEX "prescriptions_prescribedAt_idx";

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "expireAt" TIMESTAMP(3),
ADD COLUMN     "maxRenewals" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "parentPrescriptionId" TEXT,
ADD COLUMN     "renewalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "prescribedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "prescription_medications" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "sideEffects" TEXT,
    "warnings" TEXT,

    CONSTRAINT "prescription_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_templates" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescription_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_medications" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "sideEffects" TEXT,
    "warnings" TEXT,

    CONSTRAINT "template_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_renewals" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "rejectionReason" TEXT,
    "renewalCount" INTEGER NOT NULL DEFAULT 1,
    "maxRenewals" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "prescription_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_history" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "previousStatus" "PrescriptionStatus",
    "newStatus" "PrescriptionStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "PrescriptionAction" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "prescription_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescription_medications_prescriptionId_idx" ON "prescription_medications"("prescriptionId");

-- CreateIndex
CREATE INDEX "prescription_templates_doctorId_idx" ON "prescription_templates"("doctorId");

-- CreateIndex
CREATE INDEX "template_medications_templateId_idx" ON "template_medications"("templateId");

-- CreateIndex
CREATE INDEX "prescription_renewals_prescriptionId_idx" ON "prescription_renewals"("prescriptionId");

-- CreateIndex
CREATE INDEX "prescription_renewals_patientId_idx" ON "prescription_renewals"("patientId");

-- CreateIndex
CREATE INDEX "prescription_renewals_status_idx" ON "prescription_renewals"("status");

-- CreateIndex
CREATE INDEX "prescription_history_prescriptionId_idx" ON "prescription_history"("prescriptionId");

-- CreateIndex
CREATE INDEX "prescription_history_changedAt_idx" ON "prescription_history"("changedAt");

-- CreateIndex
CREATE INDEX "prescriptions_patientId_idx" ON "prescriptions"("patientId");

-- CreateIndex
CREATE INDEX "prescriptions_status_idx" ON "prescriptions"("status");

-- CreateIndex
CREATE INDEX "prescriptions_expireAt_idx" ON "prescriptions"("expireAt");

-- AddForeignKey
ALTER TABLE "prescription_medications" ADD CONSTRAINT "prescription_medications_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_templates" ADD CONSTRAINT "prescription_templates_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_medications" ADD CONSTRAINT "template_medications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prescription_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_renewals" ADD CONSTRAINT "prescription_renewals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_renewals" ADD CONSTRAINT "prescription_renewals_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_history" ADD CONSTRAINT "prescription_history_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
