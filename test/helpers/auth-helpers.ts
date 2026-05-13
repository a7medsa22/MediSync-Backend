import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TestUtils } from 'src/common/utils/test.utils';

export async function createTestUser(
  prisma: PrismaService,
  overrides: any = {},
) {
  const password = overrides.password || 'Password123!';
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: TestUtils.generateRandomEmail(),
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      isProfileComplete: true,
      isActive: true,
      ...overrides,
    },
  });

  if (user.role === UserRole.PATIENT) {
    await prisma.patient.create({
      data: {
        userId: user.id,
      },
    });
  } else if (user.role === UserRole.DOCTOR) {
    await prisma.doctor.create({
      data: {
        userId: user.id,
        licenseNumber: `LIC-${Math.random().toString(36).substring(7)}`,
      },
    });
  }

  return { ...user, rawPassword: password };
}

export async function loginAndGetToken(
  app: INestApplication,
  email: string,
  password: string = 'Password123!',
) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });

  return {
    accessToken: response.body.data.accessToken,
    refreshToken: response.body.data.refreshToken,
  };
}

export async function seedDoctor(prisma: PrismaService, overrides: any = {}) {
  return createTestUser(prisma, {
    role: UserRole.DOCTOR,
    ...overrides,
  });
}

export async function seedPatient(prisma: PrismaService, overrides: any = {}) {
  return createTestUser(prisma, {
    role: UserRole.PATIENT,
    ...overrides,
  });
}
