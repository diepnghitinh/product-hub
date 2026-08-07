import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import {
  DEFAULT_ROADMAP_COLUMNS,
  RoadmapColumn,
  RoadmapEpic,
  RoadmapItemData,
} from '../types/roadmap-item.type';
import { RoadmapProps } from './roadmap.props';

/** A Roadmap holds prioritized items across Now/Next/Later/Done horizons. */
export class RoadmapEntity extends AggregateRoot<RoadmapProps> {
  private constructor(props: RoadmapProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      projectId?: string;
      title: string;
      description?: string;
      items?: RoadmapItemData[];
      columns?: RoadmapColumn[];
      epics?: RoadmapEpic[];
      publicEnabled?: boolean;
      publicToken?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<RoadmapEntity> {
    const guard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new RoadmapEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          projectId: props.projectId || '',
          title: props.title.trim(),
          description: props.description?.trim() || '',
          items: props.items ?? [],
          columns: props.columns?.length ? props.columns : DEFAULT_ROADMAP_COLUMNS,
          // No default set — an ungrouped backlog is the honest starting state.
          epics: props.epics ?? [],
          publicEnabled: props.publicEnabled ?? false,
          publicToken: props.publicToken ?? null,
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
  get projectId(): string {
    return this.props.projectId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string {
    return this.props.description;
  }
  get items(): RoadmapItemData[] {
    return this.props.items;
  }
  get columns(): RoadmapColumn[] {
    return this.props.columns;
  }
  get epics(): RoadmapEpic[] {
    return this.props.epics;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get publicEnabled(): boolean {
    return this.props.publicEnabled;
  }
  get publicToken(): string | null {
    return this.props.publicToken;
  }

  applyMeta(meta: { title?: string; description?: string; projectId?: string }): void {
    if (meta.title !== undefined) {
      if (!meta.title.trim()) throw new Error('title cannot be empty');
      this.props.title = meta.title.trim();
    }
    if (meta.description !== undefined) this.props.description = meta.description.trim();
    if (meta.projectId !== undefined) this.props.projectId = meta.projectId;
    this.touch();
  }

  replaceItems(items: RoadmapItemData[]): void {
    this.props.items = items;
    this.touch();
  }

  replaceColumns(columns: RoadmapColumn[]): void {
    this.props.columns = columns;
    this.touch();
  }

  /**
   * Swap the epic list wholesale, then drop the `epicId` of any item whose epic
   * is no longer in it. An item pointing at a deleted epic would vanish from
   * every grouped view — not shown as ungrouped, just *gone* — so the pointer is
   * cleared here rather than left for each view to defend against.
   */
  replaceEpics(epics: RoadmapEpic[]): void {
    this.props.epics = epics;
    const live = new Set(epics.map((e) => e.id));
    this.props.items = this.props.items.map((item) =>
      item.epicId && !live.has(item.epicId) ? { ...item, epicId: '' } : item,
    );
    this.touch();
  }

  enableSharing(token: string): void {
    this.props.publicEnabled = true;
    this.props.publicToken = token;
    this.touch();
  }

  disableSharing(): void {
    this.props.publicEnabled = false;
    this.props.publicToken = null;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
