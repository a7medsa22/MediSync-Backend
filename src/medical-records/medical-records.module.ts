import { Module } from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalRecordsController } from './medical-records.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EncryptionService } from 'src/common/encryption/encryption.service';
import { AuditService } from 'src/common/audit/audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService, EncryptionService, AuditService],
})
export class MedicalRecordsModule {}
