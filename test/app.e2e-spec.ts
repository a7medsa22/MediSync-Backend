import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/test-setup';
import { UserRole } from '@prisma/client';

jest.setTimeout(60000);

describe('App (e2e critical smoke)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app as unknown as INestApplication<App>;
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Public smoke tests', () => {
    it('GET /api/v1/specializations should return 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/specializations')
        .expect(200);

      expect(Array.isArray(response.body?.data)).toBe(true);
    });

    it('POST /api/v1/auth/register/init should allow valid role', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register/init')
        .send({ role: UserRole.PATIENT })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tempUserId).toBeDefined();
    });

    it('POST /api/v1/auth/register/init should reject invalid payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register/init')
        .send({ role: 'NOT_A_REAL_ROLE' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Protected endpoint auth tests', () => {
    it('GET /api/v1/users/profile should require authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/profile')
        .expect(401);
    });

    it('GET /api/v1/auth/sessions should require authentication (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .expect(401);
    });

    it('POST /api/v1/auth/refresh should reject invalid refresh token (401)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid-refresh-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Basic routing sanity', () => {
    it('GET /api/v1/docs should respond (may be 302/200 depending on env)', async () => {
      // Swagger is only enabled in development in main.ts, but e2e test server doesn’t necessarily set NODE_ENV.
      // So we only assert it doesn’t crash with 500.
      const res = await request(app.getHttpServer())
        .get('/api/v1/docs')
        .expect((r) => {
          expect(r.status).not.toBe(500);
        });

      expect([200, 302, 401, 404]).toContain(res.status);
    });
  });
});
