import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SpecializationsService } from './specializations.service';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { OwnershipGuard } from 'src/auth/guards/roles-ownership.guard';
import { Owner } from 'src/auth/decorators/owner.decorator';

@Controller('specializations')
export class SpecializationsController {
  constructor(
    private readonly specializationsService: SpecializationsService,
  ) {}

  @Post()
  @ApiAuth()
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create new specialization (Doctor and Admin only)',
    description: 'Add a new medical specialization to the system',
  })
  @ApiResponse({
    status: 201,
    description: 'Specialization created successfully',
  })
  @ApiResponse({ status: 409, description: 'Specialization already exists' })
  create(@Body() body: CreateSpecializationDto) {
    return this.specializationsService.create(body);
  }

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get all specializations',
    description:
      'Retrieve list of all medical specializations with doctor count',
  })
  @ApiResponse({
    status: 200,
    description: 'Specializations retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Cardiology' },
              nameAr: { type: 'string', example: 'أمراض القلب' },
              description: { type: 'string' },
              _count: {
                type: 'object',
                properties: {
                  doctors: { type: 'number', example: 5 },
                },
              },
            },
          },
        },
      },
    },
  })
  findAll() {
    return this.specializationsService.findAll();
  }

  @Get('popular')
  @Public()
  @ApiOperation({
    summary: 'Get popular specializations',
    description:
      'Get specializations sorted by number of doctors (most popular first)',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Popular specializations retrieved successfully',
  })
  getPopularSpecializations(
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.specializationsService.getPopularSpecializations(limit);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get specialization by ID',
    description:
      'Get detailed information about a specific specialization including associated doctors',
  })
  @ApiResponse({
    status: 200,
    description: 'Specialization retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            nameAr: { type: 'string' },
            description: { type: 'string' },
            doctors: {
              type: 'array',
              items: { type: 'object' },
            },
            _count: {
              type: 'object',
              properties: {
                doctors: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Specialization not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.findOne(id);
  }

  @Put(':id')
  @ApiAuth()
  @UseGuards(OwnershipGuard)
  @Owner('id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update specialization (Admin only)',
    description: 'Update specialization information',
  })
  @ApiResponse({
    status: 200,
    description: 'Specialization updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Specialization not found' })
  @ApiResponse({
    status: 409,
    description: 'Specialization name already exists',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSpecializationDto,
  ) {
    return this.specializationsService.update(id, body);
  }

  @Delete(':id')
  @ApiAuth()
  @UseGuards(OwnershipGuard)
  @Owner('id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Delete specialization (Admin only)',
    description: 'Delete a specialization (only if no doctors are associated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Specialization deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Specialization not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete specialization with associated doctors',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.remove(id);
  }
}
