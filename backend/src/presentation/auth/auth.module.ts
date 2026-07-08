import { Module } from '@nestjs/common';
import { ApplicationAuthModule } from '@application/auth/auth.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [ApplicationAuthModule],
  controllers: [AuthController],
})
export class AuthPresentationModule {}
