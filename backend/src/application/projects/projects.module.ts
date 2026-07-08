import { Module } from '@nestjs/common';
import { InfrastructureProjectsModule } from '@infrastructure/projects/projects.module';
import { InfrastructureReportsModule } from '@infrastructure/reports/reports.module';
import {
  CreateProjectUseCase,
  GetProjectsUseCase,
  GetProjectUseCase,
  UpdateProjectUseCase,
  ArchiveProjectUseCase,
  RestoreProjectUseCase,
  DeleteProjectUseCase,
  SetProjectSharingUseCase,
  GetPublicProjectUseCase,
} from './use-cases';

const useCases = [
  CreateProjectUseCase,
  GetProjectsUseCase,
  GetProjectUseCase,
  UpdateProjectUseCase,
  ArchiveProjectUseCase,
  RestoreProjectUseCase,
  DeleteProjectUseCase,
  SetProjectSharingUseCase,
  GetPublicProjectUseCase,
];

@Module({
  // Reports infra is needed for the public read (project + its reports).
  imports: [InfrastructureProjectsModule, InfrastructureReportsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationProjectsModule {}
