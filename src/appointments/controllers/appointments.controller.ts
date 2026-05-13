import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { AppointmentsService } from '../service/appointments.service';
import { SlotGeneratorService } from '../service/slot-generator.service';
import {
  CancelAppointmentDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from '../dto/appointment.dto';
import { AppointmentStatus } from '@prisma/client';

@ApiTags('Appointments')
@ApiBearerAuth('JWT-auth')
@Controller()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly slotGenerator: SlotGeneratorService,
  ) {}

  @Post('appointments')
  @ApiOperation({
    summary: 'Book appointment',
    description: 'Create a new appointment booking for a patient with a doctor at an available time slot.',
  })
  @ApiQuery({ name: 'patientId', required: true, type: String, description: 'ID of the patient booking the appointment' })
  @ApiBody({
    type: CreateAppointmentDto,
    examples: {
      in_clinic: {
        summary: 'In-clinic appointment',
        value: {
          doctorId: 'doc_123',
          connectionId: 'patient_456',
          startTime: '2025-05-20T10:00:00Z',
          type: 'IN_CLINIC',
          reason: 'Regular checkup',
          clinicId: 'clinic_789',
          roomNumber: '101',
        },
      },
      online: {
        summary: 'Online appointment',
        value: {
          doctorId: 'doc_123',
          connectionId: 'patient_456',
          startTime: '2025-05-20T14:00:00Z',
          type: 'ONLINE',
          reason: 'Consultation',
          meetingLink: 'https://meet.example.com/appointment123',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Appointment booked successfully',
    example: {
      id: 'apt_123',
      doctorId: 'doc_123',
      patientId: 'patient_456',
      startTime: '2025-05-20T10:00:00Z',
      endTime: '2025-05-20T10:30:00Z',
      type: 'IN_CLINIC',
      status: 'PENDING',
      reason: 'Regular checkup',
      message: 'Appointment booked successfully',
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment data or time slot unavailable' })
  @ApiConflictResponse({ description: 'Time slot already booked or overlaps with another appointment' })
  async book(
    @Body() createDto: CreateAppointmentDto,
    @Query('patientId') patientId: string,
  ) {
    return this.appointmentsService.bookAppointment(patientId, createDto);
  }

  @Patch('appointments/:id/cancel')
  @ApiOperation({
    summary: 'Cancel appointment',
    description: 'Cancel an existing appointment. Must provide a cancellation reason.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Appointment ID' })
  @ApiQuery({
    name: 'userId',
    type: 'string',
    description: 'User ID (patient or doctor) requesting cancellation',
  })
  @ApiBody({
    type: CancelAppointmentDto,
    examples: {
      patient_request: {
        summary: 'Patient requests cancellation',
        value: {
          reason: 'PATIENT_REQUEST',
        },
      },
      doctor_request: {
        summary: 'Doctor requests cancellation',
        value: {
          reason: 'DOCTOR_REQUEST',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Appointment cancelled successfully',
    examples: {
      patient_request: {
        summary: 'Patient requests cancellation',
        value: {
          id: 'apt_123',
          status: 'CANCELLED',
          message: 'Appointment cancelled successfully',
        },
      },
      doctor_request: {
        summary: 'Doctor requests cancellation',
        value: {
          id: 'apt_123',
          status: 'CANCELLED',
          message: 'Appointment cancelled successfully',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  @ApiBadRequestResponse({ description: 'Cannot cancel appointment in this status' })
  async cancel(
    @Param('id') id: string,
    @Body() cancelDto: CancelAppointmentDto,
    @Query('userId') userId: string,
  ) {
    return this.appointmentsService.cancelAppointment(id, userId, cancelDto);
  }

  @Patch('appointments/:id/reschedule')
  @ApiOperation({
    summary: 'Reschedule appointment',
    description: 'Move an appointment to a different time slot. The new slot must be available.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Appointment ID' })
  @ApiQuery({ name: 'patientId', type: 'string', description: 'Patient ID' })
  @ApiBody({
    type: RescheduleAppointmentDto,
    examples: {
      default: {
        summary: 'Reschedule appointment',
        value: {
          newStartTime: '2025-05-20T14:00:00Z',
          reason: 'Conflict with another appointment',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Appointment rescheduled successfully',
    examples: {
      default: {
        summary: 'Reschedule appointment',
        value: {
          id: 'apt_123',
          startTime: '2025-05-20T14:00:00Z',
          endTime: '2025-05-20T14:30:00Z',
          message: 'Appointment rescheduled successfully',
        },
      },  
    },
  })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  @ApiBadRequestResponse({ description: 'Invalid new time or appointment cannot be rescheduled' })
  @ApiConflictResponse({ description: 'New time slot is unavailable' })
  async reschedule(
    @Param('id') id: string,
    @Body() rescheduleDto: RescheduleAppointmentDto,
    @Query('patientId') patientId: string,
  ) {
    return this.appointmentsService.rescheduleAppointment(id, patientId, rescheduleDto);
  }

  @Patch('appointments/:id/confirm')
  @ApiOperation({
    summary: 'Confirm appointment',
    description: 'Patient confirms their attendance for a pending appointment.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Appointment ID' })
  @ApiQuery({ name: 'patientId', type: 'string', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Appointment confirmed successfully',
    example: {
      id: 'apt_123',
      status: 'CONFIRMED',
      message: 'Appointment confirmed successfully',
    },
  })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  @ApiBadRequestResponse({ description: 'Appointment already confirmed or in invalid status' })
  async confirm(
    @Param('id') id: string,
    @Query('patientId') patientId: string,
  ) {
    return this.appointmentsService.confirmAppointment(id, patientId);
  }

  @Patch('appointments/:id/complete')
  @ApiOperation({
    summary: 'Complete appointment',
    description: 'Mark a confirmed or in-progress appointment as completed.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Appointment ID' })
  @ApiResponse({
    status: 200,
    description: 'Appointment completed successfully',
    example: {
      id: 'apt_123',
      status: 'COMPLETED',
      message: 'Appointment completed successfully',
    },
  })
  @ApiBadRequestResponse({ description: 'Appointment cannot be completed in its current status or not found' })
  async complete(@Param('id') id: string) {
    return this.appointmentsService.completeAppointment(id);
  }

  /**
   * RETRIEVAL ENDPOINTS
   */

  @Get('appointments/doctor/:doctorId')
  @ApiOperation({
    summary: 'Get doctor appointments',
    description: 'Retrieve all appointments for a specific doctor, optionally filtered by status.',
  })
  @ApiParam({ name: 'doctorId', type: 'string', description: 'Doctor ID' })
  @ApiQuery({
    name: 'status',
    enum: AppointmentStatus,
    required: false,
    description: 'Filter by appointment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Appointments retrieved successfully',
    example: [
      {
        id: 'apt_123',
        doctorId: 'doc_123',
        patientId: 'patient_456',
        startTime: '2025-05-20T10:00:00Z',
        endTime: '2025-05-20T10:30:00Z',
        type: 'IN_CLINIC',
        status: 'CONFIRMED',
        reason: 'Regular checkup',
      },
    ],
  })
  async getDoctorAppointments(
    @Param('doctorId') doctorId: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.getDoctorAppointments(doctorId, status);
  }

  @Get('appointments/patient/:patientId')
  @ApiOperation({
    summary: 'Get patient appointments',
    description: 'Retrieve all appointments for a specific patient, optionally filtered by status.',
  })
  @ApiParam({ name: 'patientId', type: 'string', description: 'Patient ID' })
  @ApiQuery({
    name: 'status',
    enum: AppointmentStatus,
    required: false,
    description: 'Filter by appointment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Appointments retrieved successfully',
    example: [
      {
        id: 'apt_123',
        doctorId: 'doc_123',
        patientId: 'patient_456',
        startTime: '2025-05-20T10:00:00Z',
        endTime: '2025-05-20T10:30:00Z',
        type: 'IN_CLINIC',
        status: 'CONFIRMED',
        reason: 'Regular checkup',
      },
    ],
  })
  async getPatientAppointments(
    @Param('patientId') patientId: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.getPatientAppointments(patientId, status);
  }

  @Get('appointments/doctor/:doctorId/slots')
  @ApiOperation({
    summary: 'Get available slots for a doctor',
    description: 'Retrieve available appointment slots for a doctor within a date range.',
  })
  @ApiParam({ name: 'doctorId', type: 'string', description: 'Doctor ID' })
  @ApiQuery({ name: 'startDate', type: String, required: true, description: 'Start date of the search range in ISO format' })
  @ApiQuery({ name: 'endDate', type: String, required: true, description: 'End date of the search range in ISO format' })
  @ApiResponse({
    status: 200,
    description: 'Available slots retrieved successfully',
    example: {
      doctorId: 'doc_123',
      availableCount: 3,
      slots: [
        {
          start: '2025-05-20T09:00:00.000Z',
          end: '2025-05-20T09:30:00.000Z',
        },
        {
          start: '2025-05-20T10:00:00.000Z',
          end: '2025-05-20T10:30:00.000Z',
        },
      ],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid date range or missing query parameters' })
  @ApiNotFoundResponse({ description: 'Doctor has not set availability' })
  async getAvailableSlots(
    @Param('doctorId') doctorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.appointmentsService.getAvailableSlots({
      doctorId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('appointments/slots/available')
  @ApiOperation({ summary: 'Get available slots for a doctor in a date range (legacy route)' })
  @ApiQuery({ name: 'doctorId', type: String, required: true, description: 'Doctor ID' })
  @ApiQuery({ name: 'startDate', type: String, required: true, description: 'Start date of the search range in ISO format' })
  @ApiQuery({ name: 'endDate', type: String, required: true, description: 'End date of the search range in ISO format' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  async getAvailableSlotsLegacy(
    @Query('doctorId') doctorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.appointmentsService.getAvailableSlots({
      doctorId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('appointments/slots/range/:doctorId')
  @ApiOperation({ summary: 'Get all generated slots for a doctor between two datetimes (legacy route)' })
  @ApiParam({ name: 'doctorId', type: String, description: 'Doctor ID' })
  @ApiQuery({ name: 'start', description: 'ISO datetime string', type: String, required: true })
  @ApiQuery({ name: 'end', description: 'ISO datetime string', type: String, required: true })
  @ApiResponse({ status: 200, description: 'Generated slot range returned successfully' })
  async getSlotRange(
    @Param('doctorId') doctorId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const slots = await this.slotGenerator.generateSlots({
      doctorId,
      startDate: new Date(start),
      endDate: new Date(end),
    });

    return { doctorId, count: slots.length, slots };
  }

  @Get('appointments/slots/next')
  @ApiOperation({ summary: 'Get next available slot(s) for a doctor from now (legacy route)' })
  @ApiQuery({ name: 'doctorId', type: String, required: true, description: 'Doctor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'How many days ahead to search' })
  @ApiResponse({ status: 200, description: 'Next available slots returned successfully' })
  async getNextSlots(
    @Query('doctorId') doctorId: string,
    @Query('days') days?: string,
  ) {
    const from = new Date();
    const toDays = days ? Number(days) : 7;
    const to = new Date(from);
    to.setDate(to.getDate() + (Number.isFinite(toDays) ? toDays : 7));

    const slots = await this.slotGenerator.generateSlots({
      doctorId,
      startDate: from,
      endDate: to,
    });

    return { doctorId, nextSlots: slots.slice(0, 10) };
  }

  @Get('appointments/:id')
  @ApiOperation({
    summary: 'Get single appointment',
    description: 'Retrieve details for a specific appointment.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Appointment ID' })
  @ApiQuery({
    name: 'userId',
    type: 'string',
    required: false,
    description: 'User ID for ownership validation (optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Appointment details retrieved successfully',
    example: {
      id: 'apt_123',
      doctorId: 'doc_123',
      patientId: 'patient_456',
      startTime: '2025-05-20T10:00:00Z',
      endTime: '2025-05-20T10:30:00Z',
      type: 'IN_CLINIC',
      status: 'CONFIRMED',
      reason: 'Regular checkup',
      clinicId: 'clinic_789',
      roomNumber: '101',
      createdAt: '2025-05-08T10:00:00Z',
      updatedAt: '2025-05-08T10:00:00Z',
    },
  })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  async getOne(
    @Param('id') id: string,
    @Query('userId') userId?: string,
  ) {
    return this.appointmentsService.getAppointmentById(id, userId);
  }
}
