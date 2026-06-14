import { AppointmentStatus } from '@prisma/client';

export enum AppointmentStatusEnum {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum CancelAppointmentReason {
  PATIENT_REQUEST = 'PATIENT_REQUEST',
  DOCTOR_UNAVAILABLE = 'DOCTOR_UNAVAILABLE',
  EMERGENCY = 'EMERGENCY',
  NO_SHOW = 'NO_SHOW',
  AUTO_EXPIRED = 'AUTO_EXPIRED',
  OTHER = 'AUTO_EXPIRED',
}
