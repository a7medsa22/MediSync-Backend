import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

export enum AuditAction {
  VIEW = 'VIEW',
  DOWNLOAD = 'DOWNLOAD',
  SHARE = 'SHARE',
  DELETE = 'DELETE',
  UPLOAD = 'UPLOAD',
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logAccess(
    recordId: string,
    userId: string,
    action: AuditAction,
    req: Request,
  ) {
    const ipAddress = this.extractIpAddress(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return this.prisma.fileAuditLog.create({
      data: {
        recordId,
        userId,
        action,
        ipAddress,
        userAgent,
      },
    });
  }

  async getAuditTrail(recordId: string) {
    return this.prisma.fileAuditLog.findMany({
      where: { recordId },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  extractIpAddress(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (
        typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0]
      ).trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }
}
