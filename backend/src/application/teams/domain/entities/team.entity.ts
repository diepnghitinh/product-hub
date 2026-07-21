import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import {
  DEFAULT_TEAM_KEYS,
  TeamIssueType,
  TeamStatusConfig,
  builtinStatusKeys,
  defaultIconFor,
  defaultStatusesFor,
} from '../enums/team.enums';
import { TeamProps } from './team.props';

/** Sentinel so the controller can map a dropped built-in status to 400. */
export const STATUS_BUILTIN_LOCKED = 'Built-in statuses cannot be removed';

/** A team: an area of the workspace with its own list of issues. */
export class TeamEntity extends AggregateRoot<TeamProps> {
  private constructor(props: TeamProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      key: string;
      name: string;
      issueType: TeamIssueType;
      icon?: string;
      color?: string | null;
      statuses?: TeamStatusConfig[];
      labels?: TaskLabelConfig[];
      archived?: boolean;
      order?: number;
      publicEnabled?: boolean;
      publicToken?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<TeamEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.issueType, argumentName: 'issueType' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);
    const nameGuard = Guard.againstEmptyString(props.name, 'name');
    if (!nameGuard.succeeded) return Result.fail(nameGuard.message);
    const keyGuard = Guard.againstEmptyString(props.key, 'key');
    if (!keyGuard.succeeded) return Result.fail(keyGuard.message);

    const now = new Date();
    return Result.ok(
      new TeamEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          key: props.key.trim(),
          name: props.name.trim(),
          issueType: props.issueType,
          // Teams created before icons existed fall back to their list's symbol.
          icon: props.icon ?? defaultIconFor(props.issueType),
          color: props.color ?? null,
          // Left raw: `statuses` resolves the defaults on read, so the boot
          // migration can still tell an unconfigured team apart.
          statuses: props.statuses?.length ? props.statuses : undefined,
          // Labels have no built-ins or defaults — empty is the expected start.
          labels: props.labels ?? [],
          archived: props.archived ?? false,
          order: props.order ?? 0,
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
  get key(): string {
    return this.props.key;
  }
  get name(): string {
    return this.props.name;
  }
  get issueType(): TeamIssueType {
    return this.props.issueType;
  }
  get icon(): string {
    return this.props.icon;
  }
  get color(): string | null {
    return this.props.color;
  }
  /** The board columns to render — the type's defaults until the team sets its own. */
  get statuses(): TeamStatusConfig[] {
    return this.props.statuses?.length
      ? this.props.statuses
      : defaultStatusesFor(this.props.issueType);
  }

  /** What's actually stored (undefined = never configured). For persistence + migration. */
  get ownStatuses(): TeamStatusConfig[] | undefined {
    return this.props.statuses;
  }

  get hasOwnStatuses(): boolean {
    return !!this.props.statuses?.length;
  }
  /** The team's item labels — shared by every task/bug in it. Empty until defined. */
  get labels(): TaskLabelConfig[] {
    return this.props.labels ?? [];
  }
  get archived(): boolean {
    return this.props.archived;
  }
  get order(): number {
    return this.props.order;
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

  /** The two seeded teams can be renamed but never archived. */
  get isDefault(): boolean {
    return DEFAULT_TEAM_KEYS.includes(this.props.key);
  }

  rename(name: string): Result<void> {
    const guard = Guard.againstEmptyString(name, 'name');
    if (!guard.succeeded) return Result.fail(guard.message);
    this.props.name = name.trim();
    this.touch();
    return Result.ok();
  }

  setIcon(icon: string): void {
    this.props.icon = icon;
    this.touch();
  }

  /** null clears it, so the symbol goes back to inheriting its surroundings. */
  setColor(color: string | null): void {
    this.props.color = color;
    this.touch();
  }

  /**
   * Replace the board columns. Built-ins may be renamed, recoloured and
   * reordered, but not dropped — the rollups read their keys.
   */
  setStatuses(statuses: TeamStatusConfig[]): Result<void> {
    if (!statuses.length) return Result.fail('A team needs at least one status');

    const keys = statuses.map((s) => s.key);
    if (new Set(keys).size !== keys.length) return Result.fail('Duplicate status keys');
    if (statuses.some((s) => !s.label?.trim())) return Result.fail('Status labels cannot be empty');

    const missing = builtinStatusKeys(this.props.issueType).filter((k) => !keys.includes(k));
    if (missing.length) {
      return Result.fail(`${STATUS_BUILTIN_LOCKED}: ${missing.join(', ')}`);
    }

    this.props.statuses = statuses.map((s) => ({
      key: s.key,
      label: s.label.trim(),
      color: s.color,
    }));
    this.touch();
    return Result.ok();
  }

  /**
   * Replace the team's item labels. No built-ins, and an empty list is valid
   * (a team may define none) — we only guard the shape: unique keys, non-empty
   * names. Keys are the stable slug stored on each task/bug.
   */
  setLabels(labels: TaskLabelConfig[]): Result<void> {
    const keys = labels.map((l) => l.key);
    if (new Set(keys).size !== keys.length) return Result.fail('Duplicate label keys');
    if (labels.some((l) => !l.name?.trim())) return Result.fail('Label names cannot be empty');

    this.props.labels = labels.map((l) => ({
      key: l.key,
      name: l.name.trim(),
      color: l.color,
    }));
    this.touch();
    return Result.ok();
  }

  setArchived(archived: boolean): Result<void> {
    if (archived && this.isDefault) {
      return Result.fail('The default teams cannot be archived');
    }
    this.props.archived = archived;
    this.touch();
    return Result.ok();
  }

  setOrder(order: number): void {
    this.props.order = order;
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
