import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { ITaskRepository } from '@application/tasks/repositories/task.repository';
import { CounterService } from './counter.service';

/**
 * Assigns short ids to bugs/tasks created before they existed, so every row has
 * a URL-facing reference.
 *
 * Runs once on boot and is idempotent — it only looks at rows still missing a
 * shortId, so a second boot finds nothing. Oldest-first, so the numbering
 * roughly follows creation order.
 */
@Injectable()
export class ShortIdBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ShortIdBackfillService.name);

  constructor(
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(ITaskRepository) private readonly tasks: ITaskRepository,
    private readonly counter: CounterService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.backfill('BUG', this.bugs);
      await this.backfill('TSK', this.tasks);
    } catch (err) {
      // Never block boot on a backfill — new rows still get ids from the counter.
      this.logger.error(`short id backfill failed: ${(err as Error).message}`);
    }
  }

  private async backfill(
    prefix: string,
    repo: {
      findWithoutShortId: () => Promise<{ id: string; tenantId: string }[]>;
      setShortId: (id: string, shortId: string) => Promise<void>;
    },
  ): Promise<void> {
    const rows = await repo.findWithoutShortId();
    if (rows.length === 0) return;

    for (const row of rows) {
      await repo.setShortId(row.id, await this.counter.nextShortId(row.tenantId, prefix));
    }
    this.logger.log(`backfilled ${rows.length} ${prefix} short id(s)`);
  }
}
