import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IProjectRepository } from '@application/projects/repositories/project.repository';
import { ProjectSchema } from './entities/project.schema';
import { ProjectRepository } from './repositories/project.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Project', schema: ProjectSchema }])],
  providers: [{ provide: IProjectRepository, useClass: ProjectRepository }],
  exports: [IProjectRepository],
})
export class InfrastructureProjectsModule {}
