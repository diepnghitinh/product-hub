import { Module } from '@nestjs/common';
import { ApplicationApiKeysModule } from '@application/api-keys/api-keys.module';
import { ApiKeysController } from './api-keys.controller';

@Module({
  imports: [ApplicationApiKeysModule],
  controllers: [ApiKeysController],
})
export class ApiKeysPresentationModule {}
