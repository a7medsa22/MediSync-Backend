import { PrismaService } from 'src/prisma/prisma.service';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthResponse } from '../interfaces/auth-response.interface';
import { ConfigService } from '@nestjs/config';
import { TokenProvider } from './token.provider';
import { UserWithRelations } from 'src/common/utils/auth.type';
import { Request } from 'express';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class LoginProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly token: TokenProvider,
    private readonly usersService: UsersService,
  ) {}

  async login(user: UserWithRelations, req: Request): Promise<AuthResponse> {
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const userAgentHeader = req.headers['user-agent'];
    const deviceNameHeader = req.headers['x-device-name'];

    const deviceInfo = {
      userAgent: Array.isArray(userAgentHeader)
        ? userAgentHeader.join(', ')
        : (userAgentHeader ?? 'Unknown agent'),

      deviceName: Array.isArray(deviceNameHeader)
        ? deviceNameHeader.join(', ')
        : (deviceNameHeader ?? 'Unknown device'),

      ipAddress: req.ip ?? 'unknown',
    };

    const doctorId = user.doctor?.id ?? null;
    const patientId = user.patient?.id ?? null;

    // Check account status
    await this.checkAccountStatus(user);

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      doctorId,
      patientId,
    };

    const accessToken = await this.token.generateAccessToken(payload);
    const refreshToken = await this.token.generateRefreshToken(
      user.id,
      deviceInfo,
    );

    // Update last login
    await this.usersService.updateLastActivity(user.id);

    return {
      user: {
        sub: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        doctorId: doctorId,
        patientId: patientId,
      },
      accessToken,
      refreshToken,
      expiresIn: Number(this.config.get('JWT_EXPIRES_IN')),
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    // Revoke all sessions for the user
    await this.prisma.authToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
    return { message: 'Logged out successfully' };
  }

  private async checkAccountStatus(user: User): Promise<void> {
    switch (user.status) {
      case UserStatus.PENDING_EMAIL_VERIFICATION:
        throw new UnauthorizedException(
          'Please verify your email before logging in.',
        );

      case UserStatus.EMAIL_VERIFIED:
        throw new UnauthorizedException(
          'Please complete your profile before logging in.',
        );

      case UserStatus.PENDING_ADMIN_APPROVAL:
        throw new UnauthorizedException(
          'Your account is pending admin approval. Please wait.',
        );

      case UserStatus.INACTIVE:
        throw new UnauthorizedException(
          'Your account is inactive. Please contact support.',
        );

      case UserStatus.SUSPENDED:
        throw new ForbiddenException(
          'Your account is suspended. Please contact support.',
        );

      case UserStatus.ACTIVE:
        // continue
        break;

      default:
        throw new UnauthorizedException(
          'Invalid account status. Please contact support.',
        );
    }
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is not active. Please contact support.',
      );
    }

    if (!user.isProfileComplete) {
      throw new UnauthorizedException(
        'Please complete your profile before logging in.',
      );
    }
  }
}
