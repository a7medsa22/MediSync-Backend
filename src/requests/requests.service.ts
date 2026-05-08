import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFollowUpRequestDto } from './dto/create-follow-up-request.dto';
import { RequestQueryDto } from './dto/request.query.dto';
import { RespondToRequestDto } from './dto/respond-to-request.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFollowUpRequest(userId: string, dto: CreateFollowUpRequestDto) {
    const { doctorId, prescriptionImage, notes } = dto;

    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { user: true },
    });

    if (!doctor || doctor.user.status !== 'ACTIVE' || !doctor.user.isActive) {
      throw new NotFoundException('Doctor not found or inactive');
    }

    const pendingRequest = await this.prisma.followUpRequest.findFirst({
      where: {
        patientId: patient.id,
        doctorId,
        status: 'PENDING',
      },
    });

    if (pendingRequest) {
      throw new ConflictException(
        'You already have a pending request with this doctor',
      );
    }

    const request = await this.prisma.followUpRequest.create({
      data: {
        patient: { connect: { id: patient.id } },
        doctor: { connect: { id: doctor.id } },
        prescriptionImage,
        notes,
      },
      include: {
        ...this.patientInclude,
        ...this.doctorInclude,
      },
    });
    // TODO: Send notification to doctor
    // await this.notificationsService.sendNewRequestNotification(doctor.userId, request);
    return {
      message: 'Follow-up request sent successfully',
      request,
    };
  }
  async getPendingRequests(doctorId: string, dto: RequestQueryDto) {
    const { page = 1, limit = 10 } = dto;

    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.prisma.followUpRequest.findMany({
        where: {
          doctorId,
          status: 'PENDING',
        },

        include: {
          ...this.patientInclude,
        },
        skip,
        take: limit,
        orderBy: { requestDate: 'asc' },
      }),
      this.prisma.followUpRequest.count({
        where: { doctorId, status: 'PENDING' },
      }),
    ]);

    return {
      requests,
      pagination: this.buildPagination(total, page, limit),
    };
  }

  async getAllRequests(doctorId: string, dto: RequestQueryDto) {
    const { page = 1, limit = 10, status } = dto;

    const skip = (page - 1) * limit;
    const where: any = { doctorId, ...(status && { status }) };

    const [requests, total] = await Promise.all([
      this.prisma.followUpRequest.findMany({
        where,
        skip,
        take: limit,
        include: this.patientInclude,
        orderBy: { requestDate: 'desc' },
      }),
      this.prisma.followUpRequest.count({ where }),
    ]);

    return {
      requests,
      pagination: this.buildPagination(total, page, limit),
    };
  }

  async acceptRequest(
    requestId: string,
    doctorId: string,
    dto: RespondToRequestDto,
  ) {
    const request = await this.prisma.followUpRequest.findUnique({
      where: { id: requestId },
      include: { patient: true, doctor: true },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.doctorId !== doctorId) {
      throw new ForbiddenException('You can only respond to your own requests');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Request is already ${request.status.toLowerCase()}`,
      );
    }
    // Update request status
    const updatedRequest = await this.prisma.followUpRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
        responseDate: new Date(),
        respondedBy: doctorId,
      },
    });

    //create connection
    const connection = await this.prisma.doctorPatientConnection.create({
      data: {
        doctorId: request.doctorId,
        patientId: request.patientId,
        connectionType: 'REQUESTED',
        status: 'ACTIVE',
        availableDays: dto.availableDays,
        availableHours: dto.availableHours,
      },
      include: {
        ...this.patientInclude,
      },
    });
    // TODO: Send notification to patient
    // await this.notificationsService.sendRequestAcceptedNotification(request.patient.userId, connection);

    return {
      message: 'Request accepted successfully',
      connection,
    };
  }

  async rejectRequest(
    requestId: string,
    doctorId: string,
    rejectionReason: string,
  ) {
    const request = await this.prisma.followUpRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.doctorId !== doctorId) {
      throw new ForbiddenException('You can only respond to your own requests');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Request is already ${request.status.toLowerCase()}`,
      );
    }

    const updatedRequest = await this.prisma.followUpRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        responseDate: new Date(),
        respondedBy: doctorId,
        rejectionReason,
      },
      include: { ...this.patientInclude },
    });

    // TODO: Send notification to patient
    // await this.notificationsService.sendRequestRejectedNotification(request.patient.userId, rejectionReason);

    return {
      message: 'Request rejected',
      request: updatedRequest,
    };
  }

  async getConnectedPatients(doctorId: string, dto: RequestQueryDto) {
    const { page = 1, limit = 10 } = dto;
    const skip = (page - 1) * limit;

    const [connections, total] = await Promise.all([
      this.prisma.doctorPatientConnection.findMany({
        where: {
          doctorId,
          status: 'ACTIVE',
        },
        include: { ...this.patientInclude },
        skip,
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
      }),
      this.prisma.doctorPatientConnection.count({
        where: { doctorId, status: 'ACTIVE' },
      }),
    ]);

    return {
      connections,
      pagination: this.buildPagination(total, page, limit),
    };
  }

  async getConnectedDoctors(patientId: string) {
    return this.prisma.doctorPatientConnection.findMany({
      where: {
        patientId,
        status: 'ACTIVE',
      },
      include: { ...this.doctorInclude },
      orderBy: {
        lastActivityAt: 'desc',
      },
    });
  }

  // Get connection details
  async getConnection(connectionId: string, userId: string) {
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: { id: connectionId },
      include: {
        ...this.doctorInclude,
        ...this.patientInclude,
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    // Check access permission
    const hasAccess =
      connection.doctor.userId === userId ||
      connection.patient.userId === userId;

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this connection');
    }

    return connection;
  }
  
  // i not need this sevice after finshed phases 2 
  async updateAvailability(
    connectionId: string,
    doctorId: string,
    dto: SetAvailabilityDto,
  ) {
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    // Update connection availability
    return this.prisma.doctorPatientConnection.update({
      where: { id: connectionId },
      data: {
        availableDays: dto.availableDays,
        availableHours: dto.availableHours,
      },
    });
  }

  async deactivateConnection(connectionId: string, doctorId: string) {
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (connection.doctorId !== doctorId) {
      throw new ForbiddenException('Only the doctor can deactivate connection');
    }

    return this.prisma.doctorPatientConnection.update({
      where: { id: connectionId },
      data: {
        status: 'INACTIVE',
      },
    });
  }

  private readonly patientInclude = {
    patient: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            nationalId: true,
          },
        },
      },
    },
  };

  private readonly doctorInclude = {
    doctor: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        specialization: true,
      },
    },
  };

  // Reusable pagination builder
  private buildPagination(total: number, page: number, limit: number) {
    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }
}
