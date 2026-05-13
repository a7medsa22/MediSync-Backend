import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from 'src/users/users.module';
import { EmailModule } from 'src/email/email.module';
import { LoginProvider } from './providers/login.provider';
import { OtpProvider } from './providers/otp.provider';
import { PasswordProvider } from './providers/password.provider';
import { RegisterProvider } from './providers/register.provider';
import { TokenProvider } from './providers/token.provider';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleOauth } from './providers/login-google.provider';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: async (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => UsersModule),
    EmailModule,
    JwtModule,
    PrismaModule,
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    JwtRefreshStrategy,
    LoginProvider,
    RegisterProvider,
    OtpProvider,
    PasswordProvider,
    TokenProvider,
    GoogleOauth,
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
