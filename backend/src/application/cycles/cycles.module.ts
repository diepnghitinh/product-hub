import { Module } from '@nestjs/common';
import { InfrastructureCyclesModule } from '@infrastructure/cycles/cycles.module';
import { InfrastructureIssuesModule } from '@infrastructure/issues/issues.module';
import { InfrastructureTeamsModule } from '@infrastructure/teams/teams.module';
import { CycleSchedulerService } from './services/cycle-scheduler.service';
import {
  GetCycleBurndownUseCase,
  GetTeamCyclesUseCase,
  UpdateTeamCycleConfigUseCase,
} from './use-cases/cycle.use-cases';

@Module({
  // The scheduler reads/writes cycles, freezes rollups from issues, and the
  // use-cases resolve the owning team. No import of ApplicationIssuesModule —
  // that module imports *this* one (list reads run the scheduler).
  imports: [InfrastructureCyclesModule, InfrastructureIssuesModule, InfrastructureTeamsModule],
  providers: [
    CycleSchedulerService,
    GetTeamCyclesUseCase,
    GetCycleBurndownUseCase,
    UpdateTeamCycleConfigUseCase,
  ],
  exports: [
    CycleSchedulerService,
    GetTeamCyclesUseCase,
    GetCycleBurndownUseCase,
    UpdateTeamCycleConfigUseCase,
    InfrastructureCyclesModule,
  ],
})
export class ApplicationCyclesModule {}
