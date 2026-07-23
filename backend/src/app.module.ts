import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { getEnvFilePath } from '@shared/utils/dotenv';
import { LoggingInterceptor } from '@core/presentation/interceptors/logging.interceptor';
import { TransformInterceptor } from '@core/presentation/interceptors/transform.interceptor';
import { DomainExceptionsFilter } from '@core/presentation/filters/domain-exceptions.filter';
import { AllExceptionsFilter } from '@core/presentation/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@core/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '@core/presentation/guards/roles.guard';

import { MongooseInfrastructureModule } from '@infrastructure/database/mongoose/mongoose.module';
import { PresentationModule } from '@presentation/presentation.module';
import { SharedModule } from '@module-shared/shared.module';

@Module({
  imports: [
    // Load the per-environment file from /config (chosen by NODE_ENV — see
    // @shared/utils/dotenv). The legacy root `.env` is kept as a fallback during
    // the transition; earlier entries win, so config/.env.<env> takes precedence.
    // `expandVariables` enables `${VAR}` interpolation inside the env files.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [getEnvFilePath(process.env['NODE_ENV']), '.env'],
      expandVariables: true,
    }),
    SharedModule,
    MongooseInfrastructureModule,
    PresentationModule,
  ],
  providers: [
    // Global interceptors (order matters: log first, then wrap the response)
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // Global filters (DomainExceptionsFilter is more specific → runs for DomainException)
    { provide: APP_FILTER, useClass: DomainExceptionsFilter },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Global guards (JWT first to populate request.user, then role check)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
