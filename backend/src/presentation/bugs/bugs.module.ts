import { Module } from '@nestjs/common';
import { ApplicationBugsModule } from '@application/bugs/bugs.module';
import { BugsController } from './bugs.controller';

@Module({
  imports: [ApplicationBugsModule],
  controllers: [BugsController],
})
export class BugsPresentationModule {}
