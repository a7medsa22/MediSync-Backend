import { AppointmentStatus } from '@prisma/client';

export interface AppointmentRefundResult {
  eligible: boolean;
  percentage: number;
}

export class AppointmentRefundPolicy {
  static readonly FULL_REFUND_PERCENTAGE = 100;
  static readonly PARTIAL_REFUND_PERCENTAGE = 50;
  static readonly NO_REFUND_PERCENTAGE = 0;
  static readonly PATIENT_PARTIAL_REFUND_CUTOFF_MS = 2 * 60 * 60 * 1000;

  static calculate(params: {
    isDoctorCancelling: boolean;
    appointmentStartMs: number;
    cancellationTimestampMs: number;
  }): AppointmentRefundResult {
    const { isDoctorCancelling, appointmentStartMs, cancellationTimestampMs } =
      params;
    const timeUntilAppointment = appointmentStartMs - cancellationTimestampMs;

    if (isDoctorCancelling) {
      return {
        eligible: true,
        percentage: this.FULL_REFUND_PERCENTAGE,
      };
    }

    if (timeUntilAppointment > this.PATIENT_PARTIAL_REFUND_CUTOFF_MS) {
      return {
        eligible: true,
        percentage: this.PARTIAL_REFUND_PERCENTAGE,
      };
    }

    return {
      eligible: false,
      percentage: this.NO_REFUND_PERCENTAGE,
    };
  }

  static isRefundableStatus(status: AppointmentStatus): boolean {
    const refundableStatuses: AppointmentStatus[] = [
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.IN_PROGRESS,
    ];

    return refundableStatuses.includes(status);
  }
}
