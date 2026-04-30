/*
  Warnings:

  - You are about to drop the column `availableDays` on the `doctor_patient_connections` table. All the data in the column will be lost.
  - You are about to drop the column `availableHours` on the `doctor_patient_connections` table. All the data in the column will be lost.
  - You are about to drop the column `consultationFee` on the `doctors` table. All the data in the column will be lost.
  - You are about to drop the column `experience` on the `doctors` table. All the data in the column will be lost.
  - You are about to drop the column `workingDays` on the `doctors` table. All the data in the column will be lost.
  - You are about to drop the column `workingHours` on the `doctors` table. All the data in the column will be lost.
  - You are about to drop the column `emergencyContact` on the `patients` table. All the data in the column will be lost.
  - You are about to drop the column `emergencyPhone` on the `patients` table. All the data in the column will be lost.
  - Changed the type of `fileType` on the `MedicalRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."RecordType" AS ENUM ('LAB_RESULT', 'XRAY', 'SCAN', 'MEDICAL_REPORT', 'VACCINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "public"."AppointmentType" AS ENUM ('IN_CLINIC', 'REMOTE');

-- CreateEnum
CREATE TYPE "public"."DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."NotificationType" ADD VALUE 'APPOINTMENT_BOOKED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'APPOINTMENT_CONFIRMED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'APPOINTMENT_REMINDER';
ALTER TYPE "public"."NotificationType" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'PAYMENT_COMPLETED';
ALTER TYPE "public"."NotificationType" ADD VALUE 'PRESCRIPTION_RENEWAL_REQUEST';
ALTER TYPE "public"."NotificationType" ADD VALUE 'PRESCRIPTION_EXPIRY_WARNING';

-- DropIndex
DROP INDEX "public"."doctor_patient_connections_status_connectedAt_idx";

-- DropIndex
DROP INDEX "public"."messages_chatId_createdAt_idx";

-- DropIndex
DROP INDEX "public"."qr_tokens_isUsed_idx";

-- AlterTable
ALTER TABLE "public"."MedicalRecord" DROP COLUMN "fileType",
ADD COLUMN     "fileType" "public"."RecordType" NOT NULL;

-- AlterTable
ALTER TABLE "public"."doctor_patient_connections" DROP COLUMN "availableDays",
DROP COLUMN "availableHours";

-- AlterTable
ALTER TABLE "public"."doctors" DROP COLUMN "consultationFee",
DROP COLUMN "experience",
DROP COLUMN "workingDays",
DROP COLUMN "workingHours",
ADD COLUMN     "education" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "yearsOfExperience" INTEGER;

-- AlterTable
ALTER TABLE "public"."patients" DROP COLUMN "emergencyContact",
DROP COLUMN "emergencyPhone",
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "insuranceNumber" TEXT,
ADD COLUMN     "insuranceProvider" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "timezone" TEXT DEFAULT 'Africa/Cairo';

-- DropEnum
DROP TYPE "public"."DocumentType";

-- CreateTable
CREATE TABLE "public"."doctor_availability" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" "public"."DayOfWeek" NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "slotDuration" INTEGER NOT NULL DEFAULT 30,
    "maxAppointmentsPerDay" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."doctor_breaks" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" "public"."DayOfWeek" NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."doctor_days_off" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_days_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."appointments" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" "public"."AppointmentType" NOT NULL DEFAULT 'IN_CLINIC',
    "status" "public"."AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notes" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "clinicId" TEXT,
    "roomNumber" TEXT,
    "meetingLink" TEXT,
    "isReminderSent24h" BOOLEAN NOT NULL DEFAULT false,
    "isReminderSent1h" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_availability_doctorId_idx" ON "public"."doctor_availability"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_availability_dayOfWeek_idx" ON "public"."doctor_availability"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_availability_doctorId_dayOfWeek_startTime_endTime_key" ON "public"."doctor_availability"("doctorId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "doctor_breaks_doctorId_idx" ON "public"."doctor_breaks"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_breaks_dayOfWeek_idx" ON "public"."doctor_breaks"("dayOfWeek");

-- CreateIndex
CREATE INDEX "doctor_days_off_doctorId_idx" ON "public"."doctor_days_off"("doctorId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_days_off_doctorId_date_key" ON "public"."doctor_days_off"("doctorId", "date");

-- CreateIndex
CREATE INDEX "appointments_doctorId_idx" ON "public"."appointments"("doctorId");

-- CreateIndex
CREATE INDEX "appointments_patientId_idx" ON "public"."appointments"("patientId");

-- CreateIndex
CREATE INDEX "appointments_connectionId_idx" ON "public"."appointments"("connectionId");

-- CreateIndex
CREATE INDEX "appointments_startTime_idx" ON "public"."appointments"("startTime");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "public"."appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_status_startTime_idx" ON "public"."appointments"("status", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_doctorId_startTime_key" ON "public"."appointments"("doctorId", "startTime");

-- AddForeignKey
ALTER TABLE "public"."doctor_availability" ADD CONSTRAINT "doctor_availability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doctor_breaks" ADD CONSTRAINT "doctor_breaks_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doctor_days_off" ADD CONSTRAINT "doctor_days_off_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."doctor_patient_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
