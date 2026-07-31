import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtPayload } from '@core/interfaces';
import { TouchUserActivityUseCase } from '@application/users/use-cases';

/**
 * Stamps "last online" on the signed-in user for every authenticated request —
 * the column in Settings → People.
 *
 * Keyed off `request.user`, which only the JWT guard sets. That's deliberate:
 * API-key callers get `request.apiAuth` instead, and an MCP agent running against
 * someone's key doesn't mean *that person* is at their desk.
 *
 * The write is fired and forgotten before the handler runs. Nobody is waiting on
 * this number, so it must never add latency to a request or fail one — and a
 * request that goes on to error still counts as the user having been here.
 */
@Injectable()
export class LastActiveInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LastActiveInterceptor.name);

  constructor(private readonly touchActivity: TouchUserActivityUseCase) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
      const userId = req.user?.userId;
      if (userId) {
        void this.touchActivity
          .execute({ userId })
          .catch((err: unknown) =>
            this.logger.warn(`Could not record activity for ${userId}: ${String(err)}`),
          );
      }
    }
    return next.handle();
  }
}
