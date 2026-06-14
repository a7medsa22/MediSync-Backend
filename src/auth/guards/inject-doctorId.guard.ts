import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class InjectDoctorIdGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const userId = user.id || user.sub;
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: userId },
      select: { id: true },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found for this user');
    }
    request.user.doctorId = doctor.id;

    return true;
  }
}
