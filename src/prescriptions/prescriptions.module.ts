import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrescriptionsService } from './services/prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionRenewalService } from './services/prescription-renewal.service';
import { PrescriptionTemplateService } from './services/prescriptions.tempalet.service';
import { PrescriptionPdfService } from './services/prescription-pdf.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [PrescriptionsController],
  providers: [
    PrescriptionsService,
    PrescriptionRenewalService,
    PrescriptionTemplateService,
    PrescriptionPdfService,
  ],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule { }
