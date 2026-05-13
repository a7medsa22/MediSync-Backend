import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType, HttpStatus } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Global Method Not Allowed Handler
  app.use((req, res, next) => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    if (!allowedMethods.includes(req.method)) {
      return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
        success: false,
        statusCode: HttpStatus.METHOD_NOT_ALLOWED,
        error: 'Method Not Allowed',
        message: [`Method ${req.method} is not supported`],
      });
    }
    next();
  });

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: config.get('CORS_ORIGIN').split(',') ?? ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Prefix
  let apiPrefix = config.get('API_PREFIX') ?? 'api';
  apiPrefix = apiPrefix.replace(/\/v\d+$/i, '');
  app.setGlobalPrefix(apiPrefix);

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
      skipNullProperties: false,
      skipUndefinedProperties: false,
    }),
  );

  // Global Filters & Interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger Documentation
  if (config.get('NODE_ENV') === 'development') {
    const config = new DocumentBuilder()
      .setTitle('MediSync API')
      .setDescription('Medical Appointment & Records Management System API')
      .setVersion('1.0')
      .addTag('Authentication', 'User authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag(
        'Requests & Connections',
        'Request a connection management endpoints',
      )
      .addTag('Prescriptions', 'Prescription management endpoints')
      .addTag('QR Code', 'Qr code endpoints')
      .addTag('Specializations', 'Specialization management endpoints')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token (format: Bearer <token>)',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // Start Server
  const port = config.get('PORT', 3000);
  await app.listen(port);

  console.log(`
  MediSync Backend Server Started!
  Server running on: http://localhost:${port}
  API Documentation: http://localhost:${port}/${apiPrefix}/docs
  Environment: ${config.get('NODE_ENV', 'development')}
  `);
}
bootstrap();
