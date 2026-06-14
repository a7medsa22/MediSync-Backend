import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GenerateQrDto,
  QrTokenType,
  ScanQrAndValidateDto,
} from './dto/generate-qr.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  QrConnectionResponseDto,
  QrTokenResponseDto,
} from './dto/qr-response.dto';
import { QrProvider } from './qr.provider';
import { ConnectionType } from '@prisma/client';
import { ActiveQrItemDto } from './dto/active-qr-list.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthUser } from 'src/auth/interfaces/request-with-user.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrProvider: QrProvider,
    private readonly eventEmitter: EventEmitter2,
  ) {}
  private userIncludeNotification = {
    user: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
      },
    },
  };
  async generateConnectionQrForDoctor(user: AuthUser, dto: GenerateQrDto) {
    if (!user.doctorId) {
      throw new BadRequestException('Doctor profile not found');
    }

    // هنا تبعت doctorId فقط
    return this.generateConnectionQr(user.doctorId, dto);
  }

  async generateConnectionQr(
    doctorId: string,
    dto: GenerateQrDto,
  ): Promise<QrTokenResponseDto> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: {
        ...this.userIncludeNotification,
        specialization: true,
      },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    if (doctor.user.status !== 'ACTIVE') {
      throw new BadRequestException('Doctor is not active');
    }

    // 2. Generate unique token
    const token = this.qrProvider.generateToken(doctorId);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (dto.expiryMinutes || 5));

    const qrToken = await this.prisma.qrToken.create({
      data: {
        doctorId,
        token,
        type: dto.type || QrTokenType.CONNECTION,
        expiresAt,
        metadata: dto.metadata || {},
      },
    });

    // . Generate QR Code image
    const qrCodeImage = await this.qrProvider.generateQrCodeImage(token);

    //Calculate remaining minutes
    const remainingMinutes = Math.floor(
      (qrToken.expiresAt.getTime() - Date.now()) / 60000,
    );

    return {
      id: qrToken.id,
      token: qrToken.token,
      qrCodeImage,
      type: qrToken.type as QrTokenType,
      createdAt: qrToken.createdAt,
      expiresAt: qrToken.expiresAt,
      remainingMinutes: Math.max(0, remainingMinutes),
      isUsed: qrToken.isUsed,
      doctor: {
        id: doctor.id,
        name: `${doctor.user.firstName} ${doctor.user.lastName}`,
        specialty: doctor.specialization?.name || 'General',
      },
    };
  }

  /**
   * Patient scans QR and creates instant connection
   */
  async scanAndConnectForPatient(user: AuthUser, dto: ScanQrAndValidateDto) {
    if (!user.patientId) {
      throw new BadRequestException('Patient profile not found');
    }

    return this.scanAndConnect(user.patientId, dto);
  }
  async scanAndConnect(
    patientId: string,
    scanDto: ScanQrAndValidateDto,
  ): Promise<QrConnectionResponseDto> {
    const qrToken = await this.validateToken(scanDto.token);
    if (qrToken.type !== QrTokenType.CONNECTION) {
      throw new BadRequestException('Invalid QR token type');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        ...this.userIncludeNotification,
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.user.status !== 'ACTIVE') {
      throw new BadRequestException('Patient is not active');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: qrToken.doctorId },
      include: {
        ...this.userIncludeNotification,
        specialization: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    if (doctor.user.status !== 'ACTIVE') {
      throw new BadRequestException('Doctor is not active');
    }

    const existingConnection =
      await this.prisma.doctorPatientConnection.findUnique({
        where: {
          doctorId_patientId: { doctorId: doctor.id, patientId: patient.id },
        },
      });
    if (existingConnection && existingConnection.status === 'ACTIVE') {
      throw new BadRequestException('Connection already exists');
    }

    const connection = await this.prisma.doctorPatientConnection.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        status: 'ACTIVE',
        connectionType: ConnectionType.QR_CODE,
        connectedAt: new Date(),
      },
    });

    const connectionNotifs = [
      {
        userId: doctor.user.id,
        senderId: patient.id,
        senderName: `${patient.user.firstName} ${patient.user.lastName}`,
      },
      {
        userId: patient.user.id,
        senderId: doctor.id,
        senderName: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      },
    ];

    connectionNotifs.forEach((notif) => {
      this.eventEmitter.emit('notification.trigger', {
        userId: notif.userId,
        type: NotificationType.NEW_CONNECTION,
        data: {
          senderId: notif.senderId,
          senderName: notif.senderName,
        },
      });
    });

    await this.prisma.qrToken.update({
      where: { id: qrToken.id },
      data: {
        isUsed: true,
        usedBy: patient.id,
        usedAt: new Date(),
      },
    });

    return {
      message:
        'connection successful! the doctor can now access your patient file',
      connectionId: connection.id,
      doctor: {
        id: doctor.id,
        name: `${doctor.user.firstName} ${doctor.user.lastName}`,
        specialty: doctor.specialization?.name || 'General',
        licenseNumber: doctor.licenseNumber || '',
      },
      patient: {
        id: patient.id,
        name: `${patient.user.firstName} ${patient.user.lastName}`,
      },
      connectedAt: connection.connectedAt,
      connectionMethod: connection.connectionType!,
      status: connection.status,
    };
  }

  /**
   * Validate QR token (check expiry, usage, etc)
   */
  async validateToken(token: string) {
    // 1. Parse and verify token format
    if (!this.qrProvider.verifyTokenFormat(token)) {
      throw new BadRequestException('Invalid QR token format');
    }

    // 2. Find token in database
    const qrToken = await this.prisma.qrToken.findUnique({
      where: { token },
    });

    if (!qrToken) {
      throw new NotFoundException();
    }

    // 3. Check if already used
    if (qrToken.isUsed) {
      throw new BadRequestException('QR Code has already been used');
    }

    // 4. Check if expired
    if (new Date() > qrToken.expiresAt) {
      throw new BadRequestException('QR Code has expired');
    }

    // 5. Verify signature
    if (!this.qrProvider.verifyTokenSignature(token, qrToken.doctorId)) {
      throw new UnauthorizedException();
    }

    return qrToken;
  }
  /**
   * Get all active QR tokens for a doctor
   */
  async getActiveTokens(doctorId: string) {
    const tokens = await this.prisma.qrToken.findMany({
      where: {
        doctorId,
        expiresAt: { gte: new Date() }, // Not expired
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const activeCount = tokens.filter((t) => !t.isUsed).length;
    const expiredCount = tokens.filter(
      (t) => new Date(t.expiresAt) < new Date(),
    ).length;

    const tokenItems: ActiveQrItemDto[] = tokens.map((token) => ({
      id: token.id,
      token: token.token,
      type: token.type as QrTokenType,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      isUsed: token.isUsed,
      usedBy: token.usedBy || undefined,
      usedAt: token.usedAt || undefined,
      remainingMinutes: Math.max(
        0,
        Math.floor((token.expiresAt.getTime() - now) / 60000),
      ),
    }));

    return {
      tokens: tokenItems,
      total: tokens.length,
      activeCount,
      expiredCount,
    };
  }
  /**
   * Invalidate/delete a QR token
   */
  async invalidateToken(doctorId: string, tokenId: string) {
    const token = await this.prisma.qrToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    if (token.doctorId !== doctorId) {
      throw new UnauthorizedException(
        'You can only invalidate your own tokens',
      );
    }

    await this.prisma.qrToken.delete({
      where: { id: tokenId },
    });

    return {
      message: 'Token invalidated successfully',
      tokenId,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens() {
    const deleted = await this.prisma.qrToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    console.log(`🧹 Cleaned up ${deleted.count} expired QR tokens`);
    return deleted.count;
  }
}
