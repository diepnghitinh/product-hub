import { Module } from '@nestjs/common';
import { InfrastructureBugsModule } from '@infrastructure/bugs/bugs.module';
import { InfrastructureTasksModule } from '@infrastructure/tasks/tasks.module';
import { ShortIdBackfillService } from './services/short-id-backfill.service';

/**
 * Kept out of `SharedModule` on purpose: this one needs the bug/task
 * repositories, and SharedModule is `@Global` + dependency-free by design.
 * `CounterService` still reaches it from there.
 */
@Module({
  imports: [InfrastructureBugsModule, InfrastructureTasksModule],
  providers: [ShortIdBackfillService],
})
export class ShortIdBackfillModule {}
