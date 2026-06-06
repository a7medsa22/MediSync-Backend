import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedDoctor, seedPatient, loginAndGetToken } from '../helpers/auth-helpers';

describe('Chat Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: any;
  let patient: any;
  let doctorProfile: any;
  let patientProfile: any;
  let connection: any;
  let doctorToken: string;
  let patientToken: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    doctorProfile = await prisma.doctor.findUnique({ where: { userId: doctor.id } });
    patientProfile = await prisma.patient.findUnique({ where: { userId: patient.id } });

    // Create a connection first
    connection = await prisma.doctorPatientConnection.create({
      data: {
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'ACTIVE',
      },
    });

    const doctorLogin = await loginAndGetToken(app, doctor.email, doctor.rawPassword);
    doctorToken = doctorLogin.accessToken;

    const patientLogin = await loginAndGetToken(app, patient.email, patient.rawPassword);
    patientToken = patientLogin.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Chat Management', () => {
    let chatId: string;

    it('should allow user to create or get a chat for a connection', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/chat/connection/${connection.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(201);

      // TransformInterceptor wraps response: { success, statusCode, message, data, timestamp }
      // Service returns { chatId: '...' } (no .data property, so whole object becomes data)
      expect(response.body.data.chatId).toBeDefined();
      chatId = response.body.data.chatId;
    });

    it('should allow user to send a message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          chatId,
          content: 'Hello Doctor!',
          messageType: 'TEXT',
        })
        .expect(201);

      // Service returns the message object (no .data property)
      expect(response.body.data.content).toBe('Hello Doctor!');
      expect(response.body.data.senderId).toBe(patient.id);
    });

    it('should allow user to get messages in a chat', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      // Service returns { data: [...] }, interceptor extracts .data
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].content).toBe('Hello Doctor!');
    });

    it('should allow user to mark message as read', async () => {
      const messagesResponse = await request(app.getHttpServer())
        .get(`/api/v1/chat/${chatId}/messages`)
        .set('Authorization', `Bearer ${doctorToken}`);

      const messageId = messagesResponse.body.data[0].id;

      await request(app.getHttpServer())
        .put(`/api/v1/chat/messages/${messageId}/read`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const updatedMessage = await prisma.message.findUnique({
        where: { id: messageId },
      });
      expect(updatedMessage?.isRead).toBe(true);
    });

    it('should prevent user from accessing a chat they are not part of', async () => {
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientToken = (await loginAndGetToken(app, anotherPatient.email, anotherPatient.rawPassword)).accessToken;

      await request(app.getHttpServer())
        .get(`/api/v1/chat/${chatId}`)
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .expect(400); // Controller throws BadRequestException if verifyUserAccess fails
    });
  });
});