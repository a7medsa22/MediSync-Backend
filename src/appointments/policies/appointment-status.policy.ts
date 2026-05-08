import { AppointmentStatus } from '@prisma/client';


export class AppointmentStatusPolicy {
    static activeStatuses(): AppointmentStatus[] {
        return [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
        ];
    }

    /**
     * Statuses to consider when checking availability (same as activeStatuses).
     * Used in slot availability checks and booking conflict detection.
     */
    static bookableStatuses(): AppointmentStatus[] {
        return this.activeStatuses();
    }

    /**
     * Terminal/final statuses that don't block booking.
     * Includes: COMPLETED, CANCELLED, NO_SHOW
     */
    static finalStatuses(): AppointmentStatus[] {
        return [
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.NO_SHOW,
        ];
    }

    /**
     * Cancelled statuses (single-element array for consistency).
     * Used for explicit cancellation checks.
     */
    static cancelledStatuses(): AppointmentStatus[] {
        return [AppointmentStatus.CANCELLED];
    }

    /**
     * Statuses eligible for reminder notifications.
     * Only CONFIRMED appointments receive reminders.
     */
    static reminderEligibleStatuses(): AppointmentStatus[] {
        return [AppointmentStatus.CONFIRMED];
    }

    /**
     * Statuses eligible for completion/marking as done.
     * Only CONFIRMED or IN_PROGRESS can be completed.
     */
    static completionEligibleStatuses(): AppointmentStatus[] {
        return [AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS];
    }

    /**
     * Statuses that can be confirmed by the patient.
     * Only PENDING appointments can be confirmed.
     */
    static confirmableStatuses(): AppointmentStatus[] {
        return [AppointmentStatus.PENDING];
    }

    private static statusTransitions(): Record<AppointmentStatus, AppointmentStatus[]> {
        return {
            [AppointmentStatus.PENDING]: [
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.CANCELLED,
            ],
            [AppointmentStatus.CONFIRMED]: [
                AppointmentStatus.IN_PROGRESS,
                AppointmentStatus.COMPLETED,
                AppointmentStatus.CANCELLED,
            ],
            [AppointmentStatus.IN_PROGRESS]: [
                AppointmentStatus.COMPLETED,
                AppointmentStatus.CANCELLED,
            ],
            [AppointmentStatus.COMPLETED]: [],
            [AppointmentStatus.CANCELLED]: [],
            [AppointmentStatus.NO_SHOW]: [],
        };
    }

    /**
     * Checks whether a status transition is allowed by lifecycle rules.
     */
    static canTransition(
        fromStatus: AppointmentStatus,
        toStatus: AppointmentStatus,
    ): boolean {
        return this.statusTransitions()[fromStatus]?.includes(toStatus) ?? false;
    }

    /**
     * Checks if an appointment can be cancelled.
     */
    static canBeCancelled(status: AppointmentStatus): boolean {
        return this.canTransition(status, AppointmentStatus.CANCELLED);
    }

    static isActive(status: AppointmentStatus): boolean {
        return this.activeStatuses().includes(status);
    }

    /**
     * Checks if an appointment status is final (terminal state).
     */
    static isFinal(status: AppointmentStatus): boolean {
        return this.finalStatuses().includes(status);
    }

    /**
     * Checks if an appointment is cancelled.
     */
    static isCancelled(status: AppointmentStatus): boolean {
        return this.cancelledStatuses().includes(status);
    }

    /**
     * Checks if an appointment is eligible for reminder notifications.
     */
    static isReminderEligible(status: AppointmentStatus): boolean {
        return this.reminderEligibleStatuses().includes(status);
    }

    /**
     * Checks if an appointment can be marked as completed.
     */
    static canBeCompleted(status: AppointmentStatus): boolean {
        return this.completionEligibleStatuses().includes(status);
    }

    /**
     * Checks if an appointment can be confirmed by the patient.
     */
    static canBeConfirmed(status: AppointmentStatus): boolean {
        return this.confirmableStatuses().includes(status);
    }

    static allStatuses(): AppointmentStatus[] {
        return [
            ...this.activeStatuses(),
            ...this.finalStatuses(),
        ];
    }
}
