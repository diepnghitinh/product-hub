import { applyDecorators, Injectable, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { PLATFORM_JWT_STRATEGY } from './platform-jwt.strategy';

/** Validates the platform token via the `platform-jwt` passport strategy. */
@Injectable()
export class PlatformAuthGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {}

/**
 * Guards a platform controller.
 *
 * `@Public()` is not a hole here — it only tells the *global tenant* JWT guard to
 * step aside, because a platform token would never satisfy it. The
 * `PlatformAuthGuard` applied on the same line is what actually authenticates the
 * request, and global guards run before controller guards, so the order holds.
 */
export const PlatformAuth = () =>
  applyDecorators(Public(), UseGuards(PlatformAuthGuard), ApiBearerAuth('platform-auth'));
