import { Injectable, CanActivate, ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class InjectPatientIdGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const userId = user.id || user.sub;

    if (user.role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: userId },
        select: { id: true },
      });

      if (!patient) throw new NotFoundException('Patient profile not found');

      request.user.patientId = patient.id;
    }

    if (user.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: userId },
        select: { id: true },
      });

      if (!doctor) throw new NotFoundException('Doctor profile not found');

      request.user.doctorId = doctor.id;
    }

    return true;
  }
}