import { Module } from '@nestjs/common';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { RoadmapsController } from './roadmaps.controller';

@Module({
  imports: [ApplicationRoadmapsModule],
  controllers: [RoadmapsController],
})
export class RoadmapsPresentationModule {}
