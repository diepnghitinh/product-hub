import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { BugSchema } from './entities/bug.schema';
import { BugRepository } from './repositories/bug.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Bug', schema: BugSchema }])],
  providers: [{ provide: IBugRepository, useClass: BugRepository }],
  exports: [IBugRepository],
})
export class InfrastructureBugsModule {}
