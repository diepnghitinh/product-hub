import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import {
  MilestoneStatus,
  ObjectiveData,
  ObjectiveInput,
  normalizeObjectives,
} from './milestone.types';
import { MilestoneProps } from './milestone.props';

/** An OKR Milestone: objectives, each with measurable key results. */
export class MilestoneEntity extends AggregateRoot<MilestoneProps> {
  private constructor(props: MilestoneProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      title: string;
      timeframe?: string;
      status?: MilestoneStatus;
      objectives?: ObjectiveData[];
      roadmapIds?: string[];
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<MilestoneEntity> {
    const guard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new MilestoneEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          title: props.title.trim(),
          timeframe: props.timeframe?.trim() || '',
          status: props.status ?? MilestoneStatus.ACTIVE,
          objectives: props.objectives ?? [],
          roadmapIds: props.roadmapIds ?? [],
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
  get title(): string {
    return this.props.title;
  }
  get timeframe(): string {
    return this.props.timeframe;
  }
  get status(): MilestoneStatus {
    return this.props.status;
  }
  get objectives(): ObjectiveData[] {
    return this.props.objectives;
  }
  get roadmapIds(): string[] {
    return this.props.roadmapIds;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  applyMeta(meta: {
    title?: string;
    timeframe?: string;
    status?: MilestoneStatus;
    roadmapIds?: string[];
  }): void {
    if (meta.title !== undefined) {
      if (!meta.title.trim()) throw new Error('title cannot be empty');
      this.props.title = meta.title.trim();
    }
    if (meta.timeframe !== undefined) this.props.timeframe = meta.timeframe.trim();
    if (meta.status !== undefined) this.props.status = meta.status;
    if (meta.roadmapIds !== undefined) this.props.roadmapIds = meta.roadmapIds;
    this.touch();
  }

  /** Objectives are pinned to 100% and their key results re-split to sum to 100. */
  replaceObjectives(objectives: ObjectiveInput[]): void {
    this.props.objectives = normalizeObjectives(objectives);
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
