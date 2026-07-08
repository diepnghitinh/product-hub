import { Module } from '@nestjs/common';
import { InfrastructureGroupsModule } from '@infrastructure/groups/groups.module';
import { InfrastructureProjectsModule } from '@infrastructure/projects/projects.module';
import {
  CreateGroupUseCase,
  GetGroupsUseCase,
  UpdateGroupUseCase,
  ReorderGroupsUseCase,
  DeleteGroupUseCase,
} from './use-cases';

const useCases = [
  CreateGroupUseCase,
  GetGroupsUseCase,
  UpdateGroupUseCase,
  ReorderGroupsUseCase,
  DeleteGroupUseCase,
];

@Module({
  // Groups verify project ownership, so they need the projects port too.
  imports: [InfrastructureGroupsModule, InfrastructureProjectsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationGroupsModule {}
