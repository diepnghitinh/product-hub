import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { CycleRollup, CycleStatus } from '../enums/cycle.enums';
import { CycleProps } from './cycle.props';

/**
 * One iteration of a team's automatic sprint rhythm. Cycles are generated and
 * closed by the scheduler (`ensureCyclesCurrent`), never created by hand, and
 * their status is always derived from the dates — see features/cycles.md.
 */
export class CycleEntity extends AggregateRoot<CycleProps> {
  private constructor(props: CycleProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      teamId: string;
      number: number;
      startDate: string;
      endDate: string;
      scopeCount?: number;
      scopePoints?: number;
      completedCount?: number;
      completedPoints?: number;
      unfinishedIds?: string[];
      closedAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<CycleEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.teamId, argumentName: 'teamId' },
      { argument: props.number, argumentName: 'number' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    if (props.number < 1) return Result.fail('Cycle numbers start at 1');
    if (!props.startDate || !props.endDate) return Result.fail('A cycle needs a date range');
    if (props.endDate < props.startDate) return Result.fail('Cycle end before its start');

    const now = new Date();
    return Result.ok(
      new CycleEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          teamId: props.teamId,
          number: props.number,
          startDate: props.startDate,
          endDate: props.endDate,
          scopeCount: props.scopeCount ?? 0,
          scopePoints: props.scopePoints ?? 0,
          completedCount: props.completedCount ?? 0,
          completedPoints: props.completedPoints ?? 0,
          unfinishedIds: props.unfinishedIds ?? [],
          closedAt: props.closedAt ?? null,
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get teamId(): string {
    return this.props.teamId;
  }
  get number(): number {
    return this.props.number;
  }
  get startDate(): string {
    return this.props.startDate;
  }
  get endDate(): string {
    return this.props.endDate;
  }
  get scopeCount(): number {
    return this.props.scopeCount;
  }
  get scopePoints(): number {
    return this.props.scopePoints;
  }
  get completedCount(): number {
    return this.props.completedCount;
  }
  get completedPoints(): number {
    return this.props.completedPoints;
  }
  get unfinishedIds(): string[] {
    return this.props.unfinishedIds;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Where this cycle sits relative to `today` (`YYYY-MM-DD`). Dates are the
   *  only authority — a cycle is "completed" the day after it ends even if the
   *  boundary hasn't been processed yet. */
  statusOn(today: string): CycleStatus {
    if (this.props.endDate < today) return CycleStatus.COMPLETED;
    if (this.props.startDate > today) return CycleStatus.UPCOMING;
    return CycleStatus.ACTIVE;
  }

  /** Frozen stats are written exactly once, at boundary processing. */
  get isClosed(): boolean {
    return this.props.closedAt !== null;
  }

  /** Freeze the stats AND who was unfinished — the record of "planned here but
   *  not done" the sweep is about to erase from the issues themselves. */
  close(rollup: CycleRollup, at: Date = new Date()): void {
    this.props.scopeCount = rollup.scopeCount;
    this.props.scopePoints = rollup.scopePoints;
    this.props.completedCount = rollup.completedCount;
    this.props.completedPoints = rollup.completedPoints;
    this.props.unfinishedIds = rollup.unfinishedIds;
    this.props.closedAt = at;
    this.props.updatedAt = at;
  }
}
