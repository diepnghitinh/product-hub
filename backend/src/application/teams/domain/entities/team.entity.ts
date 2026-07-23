import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import {
  CUSTOM_FIELD_TYPES,
  CustomFieldConfig,
  fieldTypeHasOptions,
} from '../enums/custom-field.enums';
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
      customFields?: CustomFieldConfig[];
      cyclesEnabled?: boolean;
      cycleLengthWeeks?: number;
      cycleCooldownWeeks?: number;
      cycleStartDay?: number;
      cycleStartDate?: string | null;
      cycleAutoRollover?: boolean;
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
          // Custom fields, likewise — a team starts with none.
          customFields: props.customFields ?? [],
          // Cycles are opt-in; the rhythm defaults (2 weeks, no cooldown, Monday,
          // rollover on) apply the moment a team enables them.
          cyclesEnabled: props.cyclesEnabled ?? false,
          cycleLengthWeeks: props.cycleLengthWeeks ?? 2,
          cycleCooldownWeeks: props.cycleCooldownWeeks ?? 0,
          cycleStartDay: props.cycleStartDay ?? 1,
          cycleStartDate: props.cycleStartDate ?? null,
          cycleAutoRollover: props.cycleAutoRollover ?? true,
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
  /** The team's custom fields — shared by every task/bug in it. Empty until defined. */
  get customFields(): CustomFieldConfig[] {
    return this.props.customFields ?? [];
  }
  get cyclesEnabled(): boolean {
    return this.props.cyclesEnabled;
  }
  get cycleLengthWeeks(): number {
    return this.props.cycleLengthWeeks;
  }
  get cycleCooldownWeeks(): number {
    return this.props.cycleCooldownWeeks;
  }
  get cycleStartDay(): number {
    return this.props.cycleStartDay;
  }
  get cycleStartDate(): string | null {
    return this.props.cycleStartDate;
  }
  get cycleAutoRollover(): boolean {
    return this.props.cycleAutoRollover;
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

  /**
   * Replace the team's custom fields. Like labels: no built-ins, an empty list is
   * valid, and `id` is the stable slug stored on each item's value map. We guard
   * the shape — unique ids, non-empty names, a known type, and a `select` field
   * must carry at least one (unique) option; options are dropped for other types.
   */
  setCustomFields(fields: CustomFieldConfig[]): Result<void> {
    const ids = fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) return Result.fail('Duplicate custom field ids');
    if (fields.some((f) => !f.name?.trim())) return Result.fail('Custom field names cannot be empty');
    if (fields.some((f) => !CUSTOM_FIELD_TYPES.includes(f.type)))
      return Result.fail('Unknown custom field type');

    const cleaned: CustomFieldConfig[] = [];
    for (const f of fields) {
      const field: CustomFieldConfig = { id: f.id, name: f.name.trim(), type: f.type };
      if (fieldTypeHasOptions(f.type)) {
        const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (!options.length) return Result.fail(`Dropdown field "${field.name}" needs at least one option`);
        if (new Set(options).size !== options.length)
          return Result.fail(`Dropdown field "${field.name}" has duplicate options`);
        field.options = options;
      }
      if (f.required) field.required = true;
      cleaned.push(field);
    }

    this.props.customFields = cleaned;
    this.touch();
    return Result.ok();
  }

  /** Patch the automatic sprint rhythm; only provided fields change. The
   *  scheduler consequences (seeding, deleting upcoming) live in the use-case. */
  setCycleConfig(cfg: {
    cyclesEnabled?: boolean;
    cycleLengthWeeks?: number;
    cycleCooldownWeeks?: number;
    cycleStartDay?: number;
    cycleStartDate?: string | null;
    cycleAutoRollover?: boolean;
  }): Result<void> {
    if (cfg.cycleLengthWeeks !== undefined && (cfg.cycleLengthWeeks < 1 || cfg.cycleLengthWeeks > 4)) {
      return Result.fail('Cycle length must be 1–4 weeks');
    }
    if (
      cfg.cycleCooldownWeeks !== undefined &&
      (cfg.cycleCooldownWeeks < 0 || cfg.cycleCooldownWeeks > 2)
    ) {
      return Result.fail('Cooldown must be 0–2 weeks');
    }
    if (cfg.cycleStartDay !== undefined && (cfg.cycleStartDay < 1 || cfg.cycleStartDay > 7)) {
      return Result.fail('Start day must be 1 (Monday) – 7 (Sunday)');
    }
    if (
      cfg.cycleStartDate !== undefined &&
      cfg.cycleStartDate !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(cfg.cycleStartDate)
    ) {
      return Result.fail('Start date must be an ISO date (YYYY-MM-DD)');
    }

    if (cfg.cyclesEnabled !== undefined) this.props.cyclesEnabled = cfg.cyclesEnabled;
    if (cfg.cycleLengthWeeks !== undefined) this.props.cycleLengthWeeks = cfg.cycleLengthWeeks;
    if (cfg.cycleCooldownWeeks !== undefined) this.props.cycleCooldownWeeks = cfg.cycleCooldownWeeks;
    if (cfg.cycleStartDay !== undefined) this.props.cycleStartDay = cfg.cycleStartDay;
    if (cfg.cycleStartDate !== undefined) this.props.cycleStartDate = cfg.cycleStartDate;
    if (cfg.cycleAutoRollover !== undefined) this.props.cycleAutoRollover = cfg.cycleAutoRollover;
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
