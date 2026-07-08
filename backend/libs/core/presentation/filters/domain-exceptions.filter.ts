import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '@core/exceptions';

/**
 * Translates a thrown {@link DomainException} into its declared HTTP status with
 * a consistent error body. More specific than {@link AllExceptionsFilter}, so
 * Nest routes domain errors here.
 */
@Catch(DomainException)
export class DomainExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionsFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string }>();
    const statusCode = exception.statusCode ?? 400;

    this.logger.warn(`${exception.name}: ${exception.message}`);

    response.status(statusCode).json({
      statusCode,
      message: exception.message,
      error: exception.name,
      timestamp: new Date().toISOString(),
      path: request?.url,
    });
  }
}
