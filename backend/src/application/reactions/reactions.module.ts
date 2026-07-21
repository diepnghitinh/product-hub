import { Module } from '@nestjs/common';
import { InfrastructureReactionsModule } from '@infrastructure/reactions/reactions.module';
import { GetReactionsUseCase, ToggleReactionUseCase } from './use-cases';

const useCases = [GetReactionsUseCase, ToggleReactionUseCase];

@Module({
  imports: [InfrastructureReactionsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationReactionsModule {}
