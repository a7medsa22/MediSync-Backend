import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { loginAndGetToken, seedDoctor, seedPatient } from '../helpers/auth-helpers';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Medical Records (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;
  let doctorToken: string;
  let patientToken: string;
  let doctor: any;
  let patient: any;
  let patientId: string;
  let doctorId: string;
  let recordId: string;
  let shareId: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
    eventEmitter = app.get(EventEmitter2);
    jest.spyOn(eventEmitter, 'emit');
  });

  beforeEach(async () => {
    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    const doctorLogin = await loginAndGetToken(
      app,
      doctor.email,
      doctor.rawPassword,
    );
    doctorToken = doctorLogin.accessToken;
    
    const doctorProfile = await prisma.doctor.findUnique({
      where: { userId: doctor.id },
    });
    doctorId = doctorProfile!.id;

    const patientLogin = await loginAndGetToken(
      app,
      patient.email,
      patient.rawPassword,
    );
    patientToken = patientLogin.accessToken;
    
    const patientProfile = await prisma.patient.findUnique({
      where: { userId: patient.id },
    });
    patientId = patientProfile!.id;

    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    // Cleanup local storage created during test file uploads
    await fs.rm(path.join(process.cwd(), 'local-storage'), { recursive: true, force: true }).catch(() => {});
  });

  describe('POST /medical-records', () => {
    it('should allow a doctor to upload a medical record for a patient and trigger MEDICAL_RECORD_UPLOADED notification', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v2/medical-records')
        .set('Authorization', `Bearer ${doctorToken}`)
        .attach('file', Buffer.from('dummy pdf report contents'), 'annual_report.pdf')
        .field('title', 'Annual Lab Report')
        .field('recordType', 'LAB_RESULT')
        .field('patientId', patientId)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe('Annual Lab Report');
      expect(response.body.data.uploadedBy).toBe(doctor.id);
      recordId = response.body.data.id;

      // Allow async event loop processing for notifications
      await new Promise((resolve) => setTimeout(resolve, 150));
 
      const notifications = await prisma.notification.findMany({
        where: { userId: patient.id, type: 'MEDICAL_RECORD_UPLOADED' },
      });
      expect(notifications.length).toBe(1);
      expect(notifications[0].metadata).toEqual(
        expect.objectContaining({
          recordId,
          title: 'Annual Lab Report',
          actionUrl: `/dashboard/patient/records`,
        }),
      );
    });

    it('should allow a patient to upload their own medical record (and not trigger notification to themselves)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v2/medical-records')
        .set('Authorization', `Bearer ${patientToken}`)
        .attach('file', Buffer.from('my file contents'), 'my_doc.pdf')
        .field('title', 'Self Uploaded')
        .field('recordType', 'OTHER')
        .field('patientId', patientId)
        .expect(201);

      expect(response.body.data.uploadedBy).toBe(patient.id);

      await new Promise((resolve) => setTimeout(resolve, 150));
      // Patient uploading their own record should NOT trigger a notification to themselves
      const notifications = await prisma.notification.findMany({
        where: { userId: patient.id },
      });
      expect(notifications.length).toBe(0);
    });
  });

  describe('GET /medical-records', () => {
    it('should list medical records of a patient', async () => {
      // Seed a record
      await prisma.medicalRecord.create({
        data: {
          patientId: patientId,
          title: 'Test List',
          recordType: 'XRAY',
          fileName: 'xray.png',
          fileUrl: '/local-storage/records/xray.png',
          fileSize: BigInt(500),
          mimeType: 'image/png',
          uploadedBy: patient.id,
          isEncrypted: true,
          encryptionMetadata: {
            algorithm: 'aes-256-gcm',
            iv: 'mock-iv',
            authTag: 'mock-auth-tag',
            keyId: 'key-123',
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v2/medical-records')
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId })
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /medical-records/:id/share & DELETE shares/:shareId', () => {
    it('should allow a patient/uploader to share a record and trigger MEDICAL_RECORD_SHARED notification, then revoke it', async () => {
      // 1. Create a medical record to share
      const record = await prisma.medicalRecord.create({
        data: {
          patientId: patientId,
          title: 'Prescription Record',
          recordType: 'OTHER',
          fileName: 'file.pdf',
          fileUrl: '/local-storage/records/file.pdf',
          fileSize: BigInt(300),
          mimeType: 'application/pdf',
          uploadedBy: patient.id,
          isEncrypted: true,
          encryptionMetadata: {
            algorithm: 'aes-256-gcm',
            iv: 'mock-iv',
            authTag: 'mock-auth-tag',
            keyId: 'key-123',
          },
        },
      });

      // 2. Share it with the doctor
      const shareDto = {
        sharedWithUserId: doctor.id, // Doctor's User ID
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        canDownload: true,
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v2/medical-records/${record.id}/share`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(shareDto)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.sharedWithUserId).toBe(doctor.id);
      shareId = response.body.data.id;

      // Allow async event loop processing for notifications
      await new Promise((resolve) => setTimeout(resolve, 150));

      const notifications = await prisma.notification.findMany({
        where: { userId: doctor.id, type: 'MEDICAL_RECORD_SHARED' },
      });
      expect(notifications.length).toBe(1);
      expect(notifications[0].metadata).toEqual(
        expect.objectContaining({
          recordId: record.id,
          recordTitle: 'Prescription Record',
          actionUrl: `/dashboard/doctor/records/${record.id}`,
        }),
      );

      // 3. Revoke share
      await request(app.getHttpServer())
        .delete(`/api/v2/medical-records/shares/${shareId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(204);

      // Check DB that share is removed
      const dbShare = await prisma.recordShare.findUnique({ where: { id: shareId } });
      expect(dbShare).toBeNull();
    });
  });

  describe('GET /medical-records/:id/audit', () => {
    it('should retrieve audit trail for a medical record', async () => {
      const record = await prisma.medicalRecord.create({
        data: {
          patientId: patientId,
          title: 'Audit Test Record',
          recordType: 'SCAN',
          fileName: 'scan.pdf',
          fileUrl: '/local-storage/records/scan.pdf',
          fileSize: BigInt(200),
          mimeType: 'application/pdf',
          uploadedBy: patient.id,
          isEncrypted: true,
          encryptionMetadata: {
            algorithm: 'aes-256-gcm',
            iv: 'mock-iv',
            authTag: 'mock-auth-tag',
            keyId: 'key-123',
          },
        },
      });

      // Create an audit entry
      await prisma.fileAuditLog.create({
        data: {
          recordId: record.id,
          userId: patient.id,
          action: 'VIEW',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v2/medical-records/${record.id}/audit`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].action).toBe('VIEW');
    });
  });
});
