import {
  Controller,
  Post,
  Body,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  RegisterBasicDto,
  RegisterInitDto,
  RegisterVerifyEmailDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyOtpDto,
  LoginDto,
} from './dto/auth.dto';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ===============================================
  // REGISTRATION WITH EMAIL VERIFICATION
  // ===============================================
  @Post('register/init')
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Step 1: Role Selection',
    description:
      'Initialize registration by selecting user role (Patient, Doctor, etc.)',
  })
  @ApiResponse({
    status: 201,
    description: 'Role selected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Role selected. Proceed with registration.',
        },
        data: {
          type: 'object',
          properties: {
            tempUserId: { type: 'string', example: 'uuid-string' },
            role: { type: 'string', example: 'PATIENT' },
            status: { type: 'string', example: 'INIT' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid role selection' })
  async registerInit(@Body() body: RegisterInitDto) {
    return this.authService.registerInit(body);
  }

  @Post('register/basic')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Step 2: Basic Information',
    description:
      'Add basic user information (email, password, name) and send email verification OTP',
  })
  @ApiResponse({
    status: 201,
    description: 'Basic info saved and verification email sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Basic info saved. Please verify your email.',
        },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', example: 'uuid-string' },
            status: { type: 'string', example: 'PENDING_EMAIL_VERIFICATION' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or passwords do not match',
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async registerBasic(@Body() body: RegisterBasicDto) {
    return this.authService.registerBasic(body);
  }

  @Post('register/verify-email')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 3: Email Verification',
    description: 'Verify email address using 4-digit OTP sent to email',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Email verified successfully.' },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', example: 'uuid-string' },
            status: { type: 'string', example: 'EMAIL_VERIFIED' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async registerVerifyEmail(
    @Body() registerVerifyEmailDto: RegisterVerifyEmailDto,
  ) {
    return this.authService.registerVerifyEmail(registerVerifyEmailDto);
  }

  // ===============================================
  // LOGIN
  // ===============================================

  @Post('login')
  @Public()
  @UseGuards(AuthGuard('local'))
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user using email and password to receive access and refresh tokens.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful, tokens provided',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Login successful.' },
        data: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'uuid-string' },
                role: { type: 'string', example: 'PATIENT' },
                status: { type: 'string', example: 'ACTIVE' },
              },
            },
            expiresIn: { type: 'string', example: '15m' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account not approved',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: {
          type: 'array',
          items: { type: 'string' },
          example: ['Invalid credentials'],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification code',
  })
  async login(@Req() req) {
    return this.authService.login(req.user, req);
  }
  ////////////////////
  //login with google//
  /////////////////
  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  async googleAuth(): Promise<void> {
    // This endpoint is used for initiating Google OAuth2 flow
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google OAuth2 callback',
    description: 'Handle Google OAuth2 callback and login user',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful, tokens provided',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Login successful.' },
        data: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'uuid-string' },
                role: { type: 'string', example: 'PATIENT' },
                status: { type: 'string', example: 'ACTIVE' },
              },
            },
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expiresIn: { type: 'string', example: '15m' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid Google token or account not approved',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: {
          type: 'array',
          items: { type: 'string' },
          example: ['Invalid Google token'],
        },
      },
    },
  })
  async googleLogin(@Req() req) {
    return this.authService.googleLogin(req.user, req);
  }

  // ===============================================
  // FORGOT PASSWORD WITH OTP
  // ===============================================

  @Post('forgot-password')
  @Public()
  @Throttle({ auth: { limit: 3, ttl: 300000 } }) // 3 attempts per 5 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Send password reset OTP to user email if account exists',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset code sent to email if account exists',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Password reset code sent to your email.',
        },
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', example: 'uuid-string' },
          },
        },
      },
    },
  })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('verify-reset-otp')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify password reset OTP',
    description: 'Verify the OTP sent for password reset and get reset token',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset code verified, reset token provided',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Reset code verified. You can now set a new password.',
        },
        data: {
          type: 'object',
          properties: {
            resetToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset code',
  })
  async verifyResetOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyResetPasswordOtp(verifyOtpDto);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ auth: { limit: 3, ttl: 60000 } }) // 3 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with verified token',
    description:
      'Set new password using the reset token obtained from OTP verification',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example:
            'Password reset successfully. You can now login with your new password.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token',
  })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  // ===============================================
  // RESEND OTP
  // ===============================================

  @Post('resend-otp')
  @Public()
  @Throttle({ auth: { limit: 3, ttl: 120000 } }) // 3 resend attempts per 2 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend OTP code',
    description:
      'Resend verification code for email verification, login, or password reset',
  })
  @ApiResponse({
    status: 200,
    description: 'New verification code sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'New verification code sent to your email.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Rate limit exceeded or user not found',
  })
  async resendOtp(@Body() body: ResendOtpDto) {
    return this.authService.resendOtp(body.userId, body.type);
  }

  // ===============================================
  // TOKEN MANAGEMENT
  // ===============================================

  @Post('refresh')
  @Public()
  @UseGuards(RefreshTokenGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } }) // 10 refresh attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get new access token using valid refresh token',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  async refreshToken(@Req() req) {
    const { sub, tokenId } = req.user;
    return this.authService.refreshTokens(sub, tokenId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User logout',
    description: 'Logout current user (invalidates session on client side)',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  // ===============================================
  // ACCOUNT MANAGEMENT
  // ===============================================

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change user password',
    description:
      'Change current user password (requires current password verification)',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Password changed successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid current password',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      body.oldPassword,
      body.newPassword,
    );
  }
  // ===============================================
  // Sessions MANAGEMENT
  // ===============================================

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get active sessions',
    description: 'Retrieve a list of active sessions for the current user',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '12345' },
              createdAt: {
                type: 'string',
                format: 'date-time',
                example: '2023-01-01T00:00:00Z',
              },
              lastActiveAt: {
                type: 'string',
                format: 'date-time',
                example: '2023-01-01T12:00:00Z',
              },
            },
          },
        },
      },
    },
  })
  async sessions(@CurrentUser('sub') userId: string) {
    return this.authService.getUserSessions(userId);
  }

  @Delete('sessions/:tokenId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Revoke a session',
    description:
      'Revoke a specific session by its token ID for the current user',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'tokenId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Session revoked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async revokeSession(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.authService.revokeSession(userId, tokenId);
  }
}
