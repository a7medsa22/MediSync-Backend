import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SpecializationsModule } from './specializations/specializations.module';
import { RequestsModule } from './requests/requests.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { QrModule } from './qr/qr.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { CacheModule } from './common/cache/cache.module';
import { AppointmentsModule } from './appointments/appointments.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      expandVariables: true,
    }),
    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'short',
          ttl: config.get('THROTTLE_TTL', 60) * 1000, // Convert to milliseconds
          limit: config.get('THROTTLE_LIMIT', 100),
        },
        {
          name: 'auth',
          ttl: 60 * 1000, // 1 minute
          limit: 5, // 5 requests per minute for auth endpoints
        },
        {
          name: 'upload',
          ttl: 60 * 60 * 1000, // 1 hour
          limit: 10, // 10 file uploads per hour
        },
      ],
    }),

    CacheModule,
    PrismaModule,
    ConfigModule,
    AuthModule,
    UsersModule,
    EmailModule,
    SpecializationsModule,
    RequestsModule,
    PrescriptionsModule,
    QrModule,
    NotificationsModule,
    ChatModule,
    AppointmentsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
    // Global Guards
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
