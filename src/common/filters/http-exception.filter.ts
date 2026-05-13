import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Unknown error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      message = exceptionResponse.message || exception.message;
      error = exceptionResponse.error || exception.name;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle Prisma known request errors
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'A record with this information already exists';
          error = 'Duplicate entry';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          error = 'Not found';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Foreign key constraint failed';
          error = 'Constraint error';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = `Database error: ${exception.code}`;
          error = 'Database error';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data provided to the database';
      error = 'Validation error';
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    // Log error details
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - ${message}`,
      exception instanceof Error ? exception.stack : exception,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
      // Include detailed validation messages if available
      details: Array.isArray(message) ? message : undefined,
    });
  }
}
