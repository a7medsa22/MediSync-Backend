import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CreateFollowUpRequestDto } from './dto/create-follow-up-request.dto';
import { RequestQueryDto } from './dto/request.query.dto';
import { RespondToRequestDto } from './dto/respond-to-request.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';
import { AuthUser } from 'src/auth/interfaces/request-with-user.interface';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { OwnershipGuard } from 'src/auth/guards/roles-ownership.guard';
import { Owner } from 'src/auth/decorators/owner.decorator';

@ApiTags('Requests & Connections')
@ApiAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Send Follow-up Request (Patient)',
    description:
      'Patient sends a follow-up request to a doctor with prescription image',
  })
  @ApiResponse({ status: 201, description: 'Request sent successfully' })
  @ApiResponse({
    status: 409,
    description: 'Already connected or pending request exists',
  })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async createFollowUpRequest(
    @CurrentUser('sub') userId: string,
    @Body() body: CreateFollowUpRequestDto,
  ) {
    return this.requestsService.createFollowUpRequest(userId, body);
  }

  @Get('pending')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get Pending Requests (Doctor)',
    description: 'Doctor gets list of pending follow-up requests',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending requests retrieved successfully',
  })
  async getPendingRequests(
    @CurrentUser('doctorId') doctorId: string,
    @Query() query: RequestQueryDto,
  ) {
    return this.requestsService.getPendingRequests(doctorId, query);
  }

  @Get('all')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get All Requests (Doctor)',
    description: 'Doctor gets all requests with optional status filter',
  })
  @ApiResponse({ status: 200, description: 'Requests retrieved successfully' })
  async getAllRequests(
    @Query() query: RequestQueryDto,
    @CurrentUser('doctorId') doctorId: string,
  ) {
    return this.requestsService.getAllRequests(doctorId, query);
  }

  @Post(':id/accept')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Accept Follow-up Request (Doctor)',
    description:
      'Doctor accepts a follow-up request and sets communication schedule',
  })
  @ApiResponse({
    status: 200,
    description: 'Request accepted, connection created',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 400, description: 'Request already responded' })
  @ApiParam({ name: 'id', description: 'Follow-up request ID', type: String })
  async acceptRequest(
    @Param('id', ParseUUIDPipe) requestId: string,
    @CurrentUser('doctorId') doctorId: string,
    @Body() body: RespondToRequestDto,
  ) {
    return this.requestsService.acceptRequest(requestId, doctorId, body);
  }

  @Post(':id/reject')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Reject Follow-up Request (Doctor)',
    description: 'Doctor rejects a follow-up request with reason',
  })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 400, description: 'Request already responded' })
  async rejectRequest(
    @Param('id', ParseUUIDPipe) requestId: string,
    @CurrentUser('doctorId') doctorId: string,
    @Body() body: RejectRequestDto,
  ) {
    return this.requestsService.rejectRequest(requestId, doctorId, body.reason);
  }

  // ===============================================
  // CONNECTIONS ENDPOINTS
  // ===============================================

  @Get('connections')
  @ApiOperation({
    summary: 'Get My Connections',
    description:
      'Get all active connections (Doctor: patients, Patient: doctors)',
  })
  @ApiResponse({
    status: 200,
    description: 'Connections retrieved successfully',
  })
  async getConnections(
    @CurrentUser('role') role: UserRole,
    @CurrentUser('sub') userId: string,
    @Query() query: RequestQueryDto,
  ) {
    if (role === UserRole.DOCTOR) {
      return this.requestsService.getConnectedPatients(userId, query);
    } else {
      return this.requestsService.getConnectedDoctors(userId);
    }
  }

  @Get('connections/:id')
  @ApiOperation({
    summary: 'Get Connection Details',
    description: 'Get detailed information about a specific connection',
  })
  @ApiResponse({ status: 200, description: 'Connection details retrieved' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getConnection(
    @Param('id', ParseUUIDPipe) connectionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.requestsService.getConnection(connectionId, userId);
  }

  @Put('connections/:id/availability')
  @UseGuards(OwnershipGuard)
  @Owner('id')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Update Connection Availability (Doctor)',
    description:
      'Doctor updates communication schedule for a specific connection',
  })
  @ApiResponse({
    status: 200,
    description: 'Availability updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({
    status: 403,
    description: 'Only doctor can update availability',
  })
  // async updateAvailability(
  //   @Param('id', ParseUUIDPipe) connectionId: string,
  //   @CurrentUser('sub') doctorId: string,
  //   @Body() body: SetAvailabilityDto,
  // ) {
  //   return this.requestsService.updateAvailability(
  //     connectionId,
  //     doctorId,
  //     body,
  //   );
  // }
  @Put('connections/:id/deactivate')
  @UseGuards(OwnershipGuard)
  @Owner('id')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Deactivate Connection (Doctor)',
    description: 'Doctor deactivates a connection with a patient',
  })
  @ApiResponse({ status: 200, description: 'Connection deactivated' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({
    status: 403,
    description: 'Only doctor can deactivate connection',
  })
  async deactivateConnection(
    @Param('id', ParseUUIDPipe) connectionId: string,
    @CurrentUser('sub') doctorId: string,
  ) {
    return this.requestsService.deactivateConnection(connectionId, doctorId);
  }
}
