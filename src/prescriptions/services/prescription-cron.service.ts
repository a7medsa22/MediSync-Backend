import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "src/prisma/prisma.service";
import { PrescriptionsService } from "./prescriptions.service";

@Injectable()
export class PrescriptionCronService {
    private logger = new Logger(PrescriptionCronService.name)
    constructor(
        private readonly prescriptionsService: PrescriptionsService,
    ) { }
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handlePrescriptionExpiration() {
        this.logger.log('Cron Triggered: Checking for expired prescriptions...');

        await this.prescriptionsService.processExpiredPrescriptions();
    }

    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async handleRenewalReminders() {
        this.logger.log('Cron Triggered: Sending prescription renewal reminders...');

        await this.prescriptionsService.sendRenewalReminders();
    }


    @Cron(CronExpression.EVERY_WEEKEND)
    async handleOldPrescriptionsCleanup() {
        this.logger.log('Cron Triggered: Cleaning up old pending renewal requests...');

        await this.prescriptionsService.cleanupOldPendingRequests();
    }
}