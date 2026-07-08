import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  statusCode: number;
  data: T;
}

/**
 * Wraps every successful response in a predictable `{ statusCode, data }`
 * envelope. The frontend's Axios interceptor unwraps `.data`, so controllers
 * just return their mapper DTO (or a paginated list object) and stay clean.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiEnvelope<T>> {
    const response = context.switchToHttp().getResponse<Response>();
    return next
      .handle()
      .pipe(map((data: T) => ({ statusCode: response.statusCode, data })));
  }
}
