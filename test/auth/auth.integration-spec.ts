import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { TestUtils } from 'src/common/utils/test.utils';
import { UserRole, UserStatus } from '@prisma/client';

// Helper function to handle rate limiting
const waitForRateLimit = async (ms: number = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Helper function to make login with flexible error handling
const loginWithFlexibleRetry = async (app: INestApplication, email: string, password: string): Promise<any> => {
  // Try login once, if it fails due to rate limit, that's expected behavior
  try {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return response;
  } catch (error: any) {
    // If we get a 429, it means rate limiting is working correctly
    if (error.status === 429) {
      // For test purposes, we'll skip this test or handle it gracefully
      throw new Error('RATE_LIMITED');
    }
    throw error;
  }
};

describe('Auth Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Registration Flow', () => {
    let tempUserId: string;
    const email = TestUtils.generateRandomEmail();
    const password = 'Password123!';

    it('should initialize registration (Step 1)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register/init')
        .send({ role: UserRole.PATIENT })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tempUserId).toBeDefined();
      tempUserId = response.body.data.tempUserId;
    });

    it('should complete basic registration (Step 2)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register/basic')
        .send({
          tempUserId,
          email,
          password,
          confirmPassword: password,
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(201);

      expect(response.body.data.userId).toBe(tempUserId);
      expect(response.body.data.status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
    });

    it('should verify email (Step 3)', async () => {
      const otpRecord = await prisma.otp.findFirst({
        where: { userId: tempUserId, type: 'EMAIL_VERIFICATION' },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register/verify-email')
        .send({
          userId: tempUserId,
          otp: otpRecord?.code,
        })
        .expect(200);

      expect(response.body.data.status).toBe(UserStatus.EMAIL_VERIFIED);
    });

    it('should complete profile (Step 4)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${tempUserId}/profile`)
        .send({
          phone: TestUtils.generateRandomPhone(),
          nationalId: TestUtils.generateRandomNationalId(),
          medicalCardNumber: 'MED123456',
        })
        .expect(200);

      expect(response.body.data.status).toBe(UserStatus.PENDING_ADMIN_APPROVAL);
    });
  });

  describe('Login & Session Flow', () => {
    let user: any;
    let tokens: { accessToken: string; refreshToken: string };
    const password = 'Password123!';

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash(password, 12),
          firstName: 'Active',
          lastName: 'User',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });
      await prisma.patient.create({ data: { userId: user.id } });
    });

    it('should login successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      tokens = {
        accessToken: response.body.data.accessToken,
        refreshToken: response.body.data.refreshToken,
      };
    });

    it('should fail with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'WrongPassword!',
        })
        .expect(401);
    });

    it('should refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${tokens.refreshToken}`)
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });
    it('should logout and revoke token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });
  });

  describe('Password Management Flow', () => {
    let user: any;
    let resetToken: string;
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword123!';

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash(oldPassword, 12),
          firstName: 'Pass',
          lastName: 'Change',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });
      await prisma.patient.create({ data: { userId: user.id } });
    });

    it('should handle forgot password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      const otp = await prisma.otp.findFirst({
        where: { userId: user.id, type: 'PASSWORD_RESET' },
      });
      expect(otp).toBeDefined();
    });

    it('should verify OTP', async () => {
      const otpRecord = await prisma.otp.findFirst({
        where: { userId: user.id, type: 'PASSWORD_RESET' },
      });

      expect(otpRecord).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-reset-otp')
        .send({
          userId: user.id,
          otp: otpRecord!.code
        })
        .expect(200);
        

      resetToken = response.body.data.resetToken;
      expect(resetToken).toBeDefined();
    });

    it('should reset password', async () => {
      expect(resetToken).toBeDefined();
      
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          resetToken: resetToken,
          newPassword: newPassword,
        })
        .expect(200);
    });
  });

  describe('OTP Management', () => {
    let user: any;

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash('Password123!', 12),
          firstName: 'OTP',
          lastName: 'User',
          role: UserRole.PATIENT,
          status: UserStatus.PENDING_EMAIL_VERIFICATION,
          isProfileComplete: false,
          isActive: true,
        },
      });
    });

    it('should resend email verification OTP', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-otp')
        .send({
          userId: user.id,
          type: 'EMAIL_VERIFICATION'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');

      // Verify OTP was created
      const otp = await prisma.otp.findFirst({
        where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
      });
      expect(otp).toBeDefined();
    });

    it('should resend password reset OTP', async () => {
      const activeUser = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash('Password123!', 12),
          firstName: 'Reset',
          lastName: 'User',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-otp')
        .send({
          userId: activeUser.id,
          type: 'PASSWORD_RESET'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const otp = await prisma.otp.findFirst({
        where: { userId: activeUser.id, type: 'PASSWORD_RESET' },
      });
      expect(otp).toBeDefined();
    });
    it('should fail resend OTP with invalid user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-otp')
        .send({
          userId: 'invalid-uuid',
          type: 'EMAIL_VERIFICATION'
        })
        .expect(400);
    });
  });

  describe('Change Password Flow', () => {
    let user: any;
    let accessToken: string;
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword123!';

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash(oldPassword, 12),
          firstName: 'Change',
          lastName: 'Password',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });
      await prisma.patient.create({ data: { userId: user.id } });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: oldPassword });
      accessToken = loginRes.body.data.accessToken;

    });

    it('should change password successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          oldPassword: oldPassword,
          newPassword: newPassword,
        })
        .expect(200);
    });
    it('should fail with invalid current password', async () => {

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          oldPassword: 'WrongOldPassword!',
          newPassword: newPassword,
        })
        .expect(400);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({
          oldPassword: oldPassword,
          newPassword: newPassword,
        })
        .expect(401);
    });
  });

  describe('Session Management Flow', () => {
    let loginRes: any;
    let accessToken: string;

    beforeAll(async () => {
      const sessionUser = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash('Password123!', 12),
          firstName: 'Session',
          lastName: 'Manager',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });
      await prisma.patient.create({ data: { userId: sessionUser.id } });

      loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: sessionUser.email, password: 'Password123!' });

      accessToken = loginRes.body.data.accessToken;
    });

    it('should retrieve active sessions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should fail to access sessions without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .expect(401);
    });

    it('should handle revoking a session', async () => {
      const fakeSessionId = 'some-active-session-uuid';

      const response = await request(app.getHttpServer())
        .post(`/api/v1/auth/sessions/${fakeSessionId}/revoke`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 400, 404]).toContain(response.status);
    });

    it('should fail to revoke session without authentication', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions/some-id')
        .expect(401);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let user: any;

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {
          email: TestUtils.generateRandomEmail(),
          password: await require('bcryptjs').hash('Password123!', 12),
          firstName: 'Edge',
          lastName: 'Case',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          isProfileComplete: true,
          isActive: true,
        },
      });
      await prisma.patient.create({ data: { userId: user.id } });
    });

    it('should handle invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid-refresh-token')
        .expect(401);
    });

    it('should handle malformed JWT in logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer malformed.jwt.token')
        .expect(401);
    });

    it('should handle expired OTP verification', async () => {
      // Create an OTP and manually expire it
      const otp = await prisma.otp.create({
        data: {
          userId: user.id,
          code: '123456',
          type: 'EMAIL_VERIFICATION',
          expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/register/verify-email')
        .send({
          userId: user.id,
          otp: otp.code,
        })
        .expect(400);
    });

    it('should handle invalid reset token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          resetToken: 'invalid-reset-token',
          newPassword: 'NewPassword123!',
        })
        .expect(400);
    });
  });
});