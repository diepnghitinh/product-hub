import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IReactionRepository } from '@application/reactions/repositories/reaction.repository';
import { ReactionSchema } from './entities/reaction.schema';
import { ReactionRepository } from './repositories/reaction.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Reaction', schema: ReactionSchema }])],
  providers: [{ provide: IReactionRepository, useClass: ReactionRepository }],
  exports: [IReactionRepository],
})
export class InfrastructureReactionsModule {}
