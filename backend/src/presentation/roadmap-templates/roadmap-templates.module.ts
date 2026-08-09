import { Module } from '@nestjs/common';
import { ApplicationRoadmapsModule } from '@application/roadmaps/roadmaps.module';
import { RoadmapTemplatesController } from './roadmap-templates.controller';

@Module({
  imports: [ApplicationRoadmapsModule],
  controllers: [RoadmapTemplatesController],
})
export class RoadmapTemplatesPresentationModule {}
