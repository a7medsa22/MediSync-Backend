import { Module } from '@nestjs/common';
import { AppointmentsService } from './service/appointments.service';
import { AppointmentsController } from './controllers/appointments.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SlotGeneratorService } from './service/slot-generator.service';
import { AvailabilityService } from './service/availability.service';
import { AvailabilityValidationHelpers } from './service/availability-validation.helpers';
import { AvailabilityController } from './controllers/availability.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [NotificationsModule, PrismaModule],
  controllers: [AppointmentsController, AvailabilityController],
  providers: [
    AppointmentsService,
    SlotGeneratorService,
    AvailabilityService,
    AvailabilityValidationHelpers,
  ],
})
export class AppointmentsModule {}
