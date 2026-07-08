import { Module } from '@nestjs/common';
import { ApplicationProjectsModule } from '@application/projects/projects.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [ApplicationProjectsModule],
  controllers: [ProjectsController],
})
export class ProjectsPresentationModule {}
