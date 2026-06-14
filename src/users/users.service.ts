import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { userRoleInfo } from 'src/common/enums/userRole.enum';
import { userStatusInfo } from 'src/common/enums/userStatus.enum';
import { RegisterBasicDto } from 'src/auth/dto/auth.dto';
import { UserStatePattern } from './patterns/user-state.pattern';
export type UserWithoutPassword = Omit<User, 'password'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------logics
  async findByEmail(email: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { email },
      select: this.baseUserInfo,
    });
  }
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: this.baseUserInfo,
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.baseUserInfo,
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...user,
      profile: user.role === userRoleInfo.patient ? user.patient : user.doctor,
      patient: undefined,
      doctor: undefined,
    };
  }

  async updateUserStatus(
    userId: string,
    status: userStatusInfo,
    registrationStep?: number,
  ) {
    await this.getUserOrThrow(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { status, registrationStep },
    });
  }

  async updateBasicData(dto: RegisterBasicDto, hash: string) {
    const user = await this.prisma.user.update({
      where: { id: dto.tempUserId },
      data: {
        email: dto.email,
        password: hash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: userStatusInfo.PENDING_EMAIL_VERIFICATION,
        registrationStep: 1,
      },
    });
    return user;
  }

  async updateLastActivity(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
  }

  async completeAdditionalProfile(
    userId: string,
    nationalId: string,
    phone: string,
  ) {
    const exist = await this.prisma.user.findFirst({
      where: {
        nationalId,
        id: { not: userId },
      },
    });
    if (exist) {
      throw new ConflictException('National ID already registered');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone,
        nationalId,
        status: userStatusInfo.PENDING_ADMIN_APPROVAL,
        isActive: false,
        isProfileComplete: true,
        registrationStep: 3,
      },
    });

    return updatedUser;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.getUserOrThrow(userId);

    const { firstName, lastName, phone, ...profileData } = dto;

    await this.prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName, phone },
    });

    if (user.role === userRoleInfo.patient) {
      await this.prisma.patient.update({
        where: { userId },
        data: { ...profileData },
      });
    } else if (user.role === userRoleInfo.doctor) {
      await this.prisma.doctor.update({
        where: { userId },
        data: { ...profileData },
      });
    }

    return this.getProfile(userId);
  }

  async getUserStats() {
    const [total, active, complete, patients, doctors, admins] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: userStatusInfo.ACTIVE } }),
        this.prisma.user.count({ where: { isProfileComplete: true } }),
        this.prisma.user.count({ where: { role: userRoleInfo.patient } }),
        this.prisma.user.count({ where: { role: userRoleInfo.doctor } }),
        this.prisma.user.count({ where: { role: userRoleInfo.admin } }),
      ]);

    return {
      total,
      active,
      complete,
      byRole: { patients, doctors, admins },
    };
  }

  // ---------- Registration Step

  async createInitialUser(role: userRoleInfo) {
    const newUser = await this.prisma.user.create({
      data: {
        email: `temp_${Date.now()}@temp.com`, // Temporary email
        password: 'temp_password', // Temporary password
        firstName: 'Temp',
        lastName: 'User',
        role,
        status: userStatusInfo.INIT,
        registrationStep: 0,
        isActive: false,
        isProfileComplete: false,
      },
    });
    return newUser;
  }
  async getUserRegistrationStatus(userId: string) {
    const user = await this.getUserOrThrow(userId);

    const nextStep = UserStatePattern.getNextRegistrationStep(
      user.status as userStatusInfo,
    );

    return {
      user,
      nextStep,
      isComplete:
        user.status === userStatusInfo.ACTIVE && user.isProfileComplete,
    };
  }

  // ---------- Admin Management

  async getAllUsers(query: UserQueryDto) {
    const { page = 1, limit = 10, role, status, search } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      ...(role && { role }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { nationalId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: this.baseUserInfo,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deactivateUser(
    userId: string,
    currentUserId: string,
    privacyCheck: boolean = false,
  ) {
    if (!privacyCheck) {
      if (userId === currentUserId) {
        throw new ForbiddenException('Cannot deactivate your own account');
      }
    }
    await this.getUserOrThrow(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, status: userStatusInfo.INACTIVE },
    });

    return {
      message: 'User deactivated successfully',
    };
  }

  async activateUser(userId: string) {
    const user = await this.getUserOrThrow(userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        status: user.isProfileComplete
          ? userStatusInfo.ACTIVE
          : userStatusInfo.EMAIL_VERIFIED,
      },
    });
  }
  async getUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // --- Common Helpers
  private readonly baseUserInfo = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    authProvider: true,
    phone: true,
    role: true,
    status: true,
    isActive: true,
    isProfileComplete: true,
    registrationStep: true,
    patient: { select: { id: true } },
    doctor: {
      select: { id: true, specialization: true },
    },
    createdAt: true,
    updatedAt: true,
  };

  //state pattern for registration steps
}
