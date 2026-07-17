import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import {
  DEFAULT_TEAM_KEYS,
  TeamIcon,
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
      icon?: TeamIcon;
      statuses?: TeamStatusConfig[];
      archived?: boolean;
      order?: number;
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
          // Left raw: `statuses` resolves the defaults on read, so the boot
          // migration can still tell an unconfigured team apart.
          statuses: props.statuses?.length ? props.statuses : undefined,
          archived: props.archived ?? false,
          order: props.order ?? 0,
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
  get icon(): TeamIcon {
    return this.props.icon;
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

  setIcon(icon: TeamIcon): void {
    this.props.icon = icon;
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

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
