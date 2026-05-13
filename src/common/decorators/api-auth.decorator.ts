import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ApprovedUserGuard } from 'src/auth/guards/status.guard';

export function ApiAuth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, ApprovedUserGuard, RolesGuard),
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse({ description: 'Unauthorized: Invalid or missing token' }),
    ApiForbiddenResponse({ description: 'Forbidden: Insufficient permissions or account status' }),
  );
}
