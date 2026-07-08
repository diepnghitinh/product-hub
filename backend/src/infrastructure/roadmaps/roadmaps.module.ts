import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { RoadmapSchema } from './entities/roadmap.schema';
import { RoadmapRepository } from './repositories/roadmap.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Roadmap', schema: RoadmapSchema }])],
  providers: [{ provide: IRoadmapRepository, useClass: RoadmapRepository }],
  exports: [IRoadmapRepository],
})
export class InfrastructureRoadmapsModule {}
