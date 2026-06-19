import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { AvailabilityService } from '../service/availability.service';
import {
  CreateAvailabilityRequestDto,
  CreateMultipleAvailabilitiesRequestDto,
  UpdateAvailabilityRequestDto,
  CreateBreakRequestDto,
  UpdateBreakRequestDto,
  CreateDayOffRequestDto,
  CreateMultipleDaysOffRequestDto,
} from '../dto/availability.dto';

@ApiTags('Doctor Availability Management')
@ApiBearerAuth('JWT-auth')
@Controller({
  path:'availability',
  version: '2',
})
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * AVAILABILITY ENDPOINTS
   */

  @Post()
  @ApiOperation({
    summary: 'Create doctor availability',
    description:
      'Create a new availability window for a specific day and time. Prevents overlapping availability windows.',
  })
  @ApiBody({ type: CreateAvailabilityRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Availability created successfully',
    example: {
      id: 'avail_123',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30,
      maxAppointmentsPerDay: 10,
      message: 'Availability created successfully',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid time range, slot duration, or max appointments',
  })
  @ApiConflictResponse({
    description: 'Overlapping availability already exists for this day',
  })
  async createAvailability(@Body() createDto: CreateAvailabilityRequestDto) {
    const { doctorId, ...availabilityDto } = createDto;
    return this.availabilityService.createAvailability(
      doctorId,
      availabilityDto,
    );
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Create multiple availabilities (bulk)',
    description:
      'Create multiple availability windows at once. Returns partial success if some entries fail.',
  })
  @ApiBody({ type: CreateMultipleAvailabilitiesRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Bulk availability processed',
    example: {
      created: 5,
      failed: 1,
      results: [
        {
          id: 'avail_123',
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30,
          message: 'Availability created successfully',
        },
      ],
      errors: [
        {
          dayOfWeek: 'TUESDAY',
          error: 'Overlapping availability already exists for this day',
        },
      ],
    },
  })
  async createMultipleAvailabilities(
    @Body() createDto: CreateMultipleAvailabilitiesRequestDto,
  ) {
    const { doctorId, ...bulkDto } = createDto;
    return this.availabilityService.createMultipleAvailabilities(
      doctorId,
      bulkDto,
    );
  }

  @Get('doctor/:doctorId')
  @ApiOperation({
    summary: 'Get doctor availabilities',
    description:
      'Retrieve all active availability windows for a specific doctor, ordered by day and start time.',
  })
  @ApiParam({
    name: 'doctorId',
    type: 'string',
    description: 'Unique identifier of the doctor',
  })
  @ApiResponse({
    status: 200,
    description: 'Availabilities retrieved successfully',
    example: [
      {
        id: 'avail_123',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        maxAppointmentsPerDay: 10,
        isActive: true,
        createdAt: '2025-05-08T10:00:00Z',
        updatedAt: '2025-05-08T10:00:00Z',
      },
    ],
  })
  @ApiNotFoundResponse({ description: 'Doctor has no availabilities set' })
  async getDoctorAvailabilities(@Param('doctorId') doctorId: string) {
    return this.availabilityService.getAvailabilities(doctorId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update availability',
    description:
      'Update an existing availability window. Validates against overlapping windows and time constraints.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Availability ID' })
  @ApiBody({ type: UpdateAvailabilityRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Availability updated successfully',
    example: {
      id: 'avail_123',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '18:00',
      slotDuration: 30,
      maxAppointmentsPerDay: 12,
      message: 'Availability updated successfully',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid update parameters or validation failed',
  })
  @ApiNotFoundResponse({
    description: 'Availability not found or not owned by doctor',
  })
  @ApiConflictResponse({
    description: 'Update would create overlapping availability',
  })
  async updateAvailability(
    @Param('id') id: string,
    @Body() updateDto: UpdateAvailabilityRequestDto,
  ) {
    const { doctorId, ...patchDto } = updateDto;
    return this.availabilityService.updateAvailability(doctorId, id, patchDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete availability (soft delete)',
    description:
      'Soft delete an availability window. The record remains in database but is marked inactive.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Availability ID' })
  @ApiResponse({
    status: 200,
    description: 'Availability deleted successfully',
  })
  @ApiNotFoundResponse({
    description: 'Availability not found or not owned by doctor',
  })
  async deleteAvailability(
    @Param('id') id: string,
    @Body() body: { doctorId: string },
  ) {
    return this.availabilityService.deleteAvailability(body.doctorId, id);
  }

  /**
   * BREAK ENDPOINTS
   */

  @Post('breaks')
  @ApiOperation({
    summary: 'Create doctor break',
    description:
      'Create a break period (e.g., lunch, prayer time) within an availability window. Breaks cannot overlap with each other or extend outside availability times.',
  })
  @ApiBody({ type: CreateBreakRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Break created successfully',
    example: {
      id: 'break_123',
      dayOfWeek: 'MONDAY',
      startTime: '12:00',
      endTime: '13:00',
      reason: 'Lunch break',
      message: 'Break created successfully',
    },
  })
  @ApiBadRequestResponse({
    description: 'Break outside availability window or invalid time range',
  })
  @ApiConflictResponse({ description: 'Break overlaps with existing break' })
  async createBreak(@Body() createDto: CreateBreakRequestDto) {
    const { doctorId, ...breakDto } = createDto;
    return this.availabilityService.createBreak(doctorId, breakDto);
  }

  @Get('breaks/:doctorId')
  @ApiOperation({
    summary: 'Get doctor breaks',
    description:
      'Retrieve all break periods for a doctor, ordered by day and start time.',
  })
  @ApiParam({
    name: 'doctorId',
    type: 'string',
    description: 'Unique identifier of the doctor',
  })
  @ApiResponse({
    status: 200,
    description: 'Breaks retrieved successfully',
    example: [
      {
        id: 'break_123',
        dayOfWeek: 'MONDAY',
        startTime: '12:00',
        endTime: '13:00',
        reason: 'Lunch break',
        createdAt: '2025-05-08T10:00:00Z',
      },
    ],
  })
  async getBreaks(@Param('doctorId') doctorId: string) {
    return this.availabilityService.getBreaks(doctorId);
  }

  @Patch('breaks/:id')
  @ApiOperation({
    summary: 'Update doctor break',
    description:
      'Update an existing break period. Validates against overlapping breaks and availability constraints.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Break ID' })
  @ApiBody({ type: UpdateBreakRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Break updated successfully',
    example: {
      id: 'break_123',
      dayOfWeek: 'MONDAY',
      startTime: '12:00',
      endTime: '13:30',
      reason: 'Extended lunch break',
      message: 'Break updated successfully',
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid break parameters or validation failed',
  })
  @ApiNotFoundResponse({
    description: 'Break not found or not owned by doctor',
  })
  @ApiConflictResponse({ description: 'Update would create overlapping break' })
  async updateBreak(
    @Param('id') id: string,
    @Body() updateDto: UpdateBreakRequestDto,
  ) {
    const { doctorId, ...patchDto } = updateDto;
    return this.availabilityService.updateBreak(doctorId, id, patchDto);
  }

  @Delete('breaks/:id')
  @ApiOperation({
    summary: 'Delete doctor break',
    description: 'Delete a break period permanently.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Break ID' })
  @ApiResponse({ status: 200, description: 'Break deleted successfully' })
  @ApiNotFoundResponse({
    description: 'Break not found or not owned by doctor',
  })
  async deleteBreak(
    @Param('id') id: string,
    @Body() body: { doctorId: string },
  ) {
    return this.availabilityService.deleteBreak(body.doctorId, id);
  }

  /**
   * DAY-OFF ENDPOINTS
   */

  @Post('day-offs')
  @ApiOperation({
    summary: 'Create doctor day-off',
    description:
      'Mark a specific date as day-off (e.g., vacation, conference, sick leave). Cannot be set for past dates.',
  })
  @ApiBody({ type: CreateDayOffRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Day-off created successfully',
    example: {
      id: 'dayoff_123',
      date: '2025-05-20',
      reason: 'Vacation',
      message: 'Day-off created successfully',
    },
  })
  @ApiBadRequestResponse({ description: 'Cannot set day-off in the past' })
  @ApiConflictResponse({ description: 'Day-off already exists for this date' })
  async createDayOff(@Body() createDto: CreateDayOffRequestDto) {
    const { doctorId, ...dayOffDto } = createDto;
    return this.availabilityService.createDayOff(doctorId, dayOffDto);
  }

  @Post('day-offs/bulk')
  @ApiOperation({
    summary: 'Create multiple day-offs (bulk)',
    description:
      'Create multiple day-off entries at once. Returns partial success if some entries fail.',
  })
  @ApiBody({ type: CreateMultipleDaysOffRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Bulk day-offs processed',
    example: {
      created: 5,
      failed: 1,
      results: [
        {
          id: 'dayoff_123',
          date: '2025-05-20',
          reason: 'Vacation',
          message: 'Day-off created successfully',
        },
      ],
      errors: [
        {
          date: '2025-04-20',
          error: 'Cannot set day-off in the past',
        },
      ],
    },
  })
  async createMultipleDaysOff(
    @Body() createDto: CreateMultipleDaysOffRequestDto,
  ) {
    const { doctorId, ...bulkDto } = createDto;
    return this.availabilityService.createMultipleDaysOff(doctorId, bulkDto);
  }

  @Get('day-offs/:doctorId')
  @ApiOperation({
    summary: 'Get doctor day-offs',
    description: 'Retrieve all day-off periods for a doctor, ordered by date.',
  })
  @ApiParam({
    name: 'doctorId',
    type: 'string',
    description: 'Unique identifier of the doctor',
  })
  @ApiResponse({
    status: 200,
    description: 'Day-offs retrieved successfully',
    example: [
      {
        id: 'dayoff_123',
        date: '2025-05-20',
        reason: 'Vacation',
        createdAt: '2025-05-08T10:00:00Z',
      },
    ],
  })
  async getDayOffs(@Param('doctorId') doctorId: string) {
    return this.availabilityService.getDaysOff(doctorId);
  }

  @Delete('day-offs/:id')
  @ApiOperation({
    summary: 'Delete doctor day-off',
    description: 'Remove a day-off entry permanently.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Day-off ID' })
  @ApiResponse({ status: 200, description: 'Day-off deleted successfully' })
  @ApiNotFoundResponse({
    description: 'Day-off not found or not owned by doctor',
  })
  async deleteDayOff(
    @Param('id') id: string,
    @Body() body: { doctorId: string },
  ) {
    return this.availabilityService.deleteDayOff(body.doctorId, id);
  }

  /**
   * SUMMARY ENDPOINT
   */

  @Get('summary/:doctorId')
  @ApiOperation({
    summary: 'Get availability summary',
    description:
      "Get a complete overview of a doctor's availability configuration including all windows, breaks, and day-offs.",
  })
  @ApiParam({
    name: 'doctorId',
    type: 'string',
    description: 'Unique identifier of the doctor',
  })
  @ApiResponse({
    status: 200,
    description: 'Availability summary retrieved successfully',
    example: {
      doctorId: 'doc_123',
      summary: {
        availabilityWindows: 5,
        breaksConfigured: 8,
        daysOffScheduled: 3,
      },
      details: {
        availabilities: [],
        breaks: [],
        daysOff: [],
      },
    },
  })
  async getAvailabilitySummary(@Param('doctorId') doctorId: string) {
    return this.availabilityService.getAvailabilitySummary(doctorId);
  }
}
