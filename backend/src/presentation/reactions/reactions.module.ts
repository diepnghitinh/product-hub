import { Module } from '@nestjs/common';
import { ApplicationReactionsModule } from '@application/reactions/reactions.module';
import { ReactionsController } from './reactions.controller';

@Module({
  imports: [ApplicationReactionsModule],
  controllers: [ReactionsController],
})
export class ReactionsPresentationModule {}
