import { Module } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { ClinicsController } from './clinics.controller';
import { DoctorProfileService } from './doctor-profile.service';
import { DoctorProfileController } from './doctor-profile.controller';
import { DoctorsController } from './doctors.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicsController, DoctorProfileController, DoctorsController],
  providers: [ClinicsService, DoctorProfileService],
  exports: [ClinicsService, DoctorProfileService],
})
export class ClinicsModule {}




