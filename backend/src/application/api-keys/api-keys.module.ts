import { Module } from '@nestjs/common';
import { InfrastructureApiKeysModule } from '@infrastructure/api-keys/api-keys.module';
import {
  GenerateApiKeyUseCase,
  GetApiKeysUseCase,
  RevokeApiKeyUseCase,
  AuthenticateApiKeyUseCase,
} from './use-cases/api-key.use-cases';

const useCases = [
  GenerateApiKeyUseCase,
  GetApiKeysUseCase,
  RevokeApiKeyUseCase,
  AuthenticateApiKeyUseCase,
];

@Module({
  imports: [InfrastructureApiKeysModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationApiKeysModule {}
