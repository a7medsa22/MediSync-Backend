import { Module } from '@nestjs/common';
import { AppointmentsService } from './service/appointments.service';
import { AppointmentsController } from './appointments.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { SlotGeneratorService } from './service/slot-generator.service';

@Module({
  imports:[NotificationsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService,SlotGeneratorService],
})
export class AppointmentsModule {}
