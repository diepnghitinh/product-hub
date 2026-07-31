import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApplicationUsersModule } from '@application/users/users.module';
import { UsersController } from './users.controller';
import { LastActiveInterceptor } from './last-active.interceptor';

@Module({
  imports: [ApplicationUsersModule],
  controllers: [UsersController],
  // Registered here rather than in AppModule so it sits next to the use-case it
  // needs; an APP_INTERCEPTOR applies app-wide from whichever module declares it.
  providers: [{ provide: APP_INTERCEPTOR, useClass: LastActiveInterceptor }],
})
export class UsersPresentationModule {}
