import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { BugStatusConfig, DEFAULT_BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig, DEFAULT_TASK_STATUSES } from '@application/tasks/domain/enums/task.enums';
import { WebhookConfig, normalizeWebhook } from './webhook.types';
import { CloudStorageConfig, defaultStorageConfig } from './storage.types';
import { GitIntegrationConfig } from './integration.types';
import { ClickUpConfig } from './clickup.types';

interface AppSettingsProps {
  tenantId: string;
  webhooks: WebhookConfig[];
  integrations: GitIntegrationConfig[];
  /** The connected ClickUp workspace, or `null` when there isn't one. */
  clickup: ClickUpConfig | null;
  bugStatuses: BugStatusConfig[];
  taskStatuses: TaskStatusConfig[];
  storage: CloudStorageConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-tenant settings singleton. Holds outbound webhook config (Phase 5); bug
 * statuses/fields configuration will live here too as the product grows. */
export class AppSettingsEntity extends AggregateRoot<AppSettingsProps> {
  private constructor(props: AppSettingsProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      webhooks?: WebhookConfig[];
      integrations?: GitIntegrationConfig[];
      clickup?: ClickUpConfig | null;
      bugStatuses?: BugStatusConfig[];
      taskStatuses?: TaskStatusConfig[];
      storage?: CloudStorageConfig;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<AppSettingsEntity> {
    const guard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!guard.succeeded) return Result.fail(guard.message);
    const now = new Date();
    return Result.ok(
      new AppSettingsEntity(
        {
          tenantId: props.tenantId,
          webhooks: (props.webhooks ?? []).map(normalizeWebhook),
          integrations: props.integrations ?? [],
          clickup: props.clickup ?? null,
          // Fall back to the shipped defaults for tenants that predate the field.
          bugStatuses: props.bugStatuses?.length ? props.bugStatuses : DEFAULT_BUG_STATUSES,
          taskStatuses: props.taskStatuses?.length ? props.taskStatuses : DEFAULT_TASK_STATUSES,
          // Merge over defaults so provider + size caps are always present, even
          // for docs that predate the storage field or persist a partial config.
          storage: props.storage
            ? { ...defaultStorageConfig(), ...props.storage }
            : defaultStorageConfig(),
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
  get webhooks(): WebhookConfig[] {
    return this.props.webhooks;
  }
  get integrations(): GitIntegrationConfig[] {
    return this.props.integrations;
  }
  get clickup(): ClickUpConfig | null {
    return this.props.clickup;
  }
  get bugStatuses(): BugStatusConfig[] {
    return this.props.bugStatuses;
  }
  get taskStatuses(): TaskStatusConfig[] {
    return this.props.taskStatuses;
  }
  get storage(): CloudStorageConfig {
    return this.props.storage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  setWebhooks(webhooks: WebhookConfig[]): void {
    this.props.webhooks = webhooks;
    this.props.updatedAt = new Date();
  }

  setIntegrations(integrations: GitIntegrationConfig[]): void {
    this.props.integrations = integrations;
    this.props.updatedAt = new Date();
  }

  /**
   * Stamp "we heard from this repo" after a delivery. Separate from
   * `setIntegrations` because it's written by the *webhook* path, which must
   * never touch the rest of an admin's configuration — the two writers can
   * legitimately race, and only one of them is the user.
   */
  recordIntegrationDelivery(id: string, summary: string): void {
    const at = new Date().toISOString();
    this.props.integrations = this.props.integrations.map((i) =>
      i.id === id ? { ...i, lastEventAt: at, lastEventSummary: summary } : i,
    );
    this.props.updatedAt = new Date();
  }

  /** Connect, reconfigure, or (with `null`) disconnect the ClickUp workspace. */
  setClickUp(clickup: ClickUpConfig | null): void {
    this.props.clickup = clickup;
    this.props.updatedAt = new Date();
  }

  /**
   * Stamp "we heard from ClickUp" after a delivery. Separate from
   * {@link setClickUp} for the same reason `recordIntegrationDelivery` is
   * separate: this one is written by the *webhook* path, which must never touch
   * the admin's configuration — the two writers can legitimately race, and only
   * one of them is the user. A no-op when nothing is connected.
   */
  recordClickUpDelivery(summary: string): void {
    if (!this.props.clickup) return;
    this.props.clickup = {
      ...this.props.clickup,
      lastEventAt: new Date().toISOString(),
      lastEventSummary: summary,
    };
    this.props.updatedAt = new Date();
  }

  setBugStatuses(bugStatuses: BugStatusConfig[]): void {
    this.props.bugStatuses = bugStatuses;
    this.props.updatedAt = new Date();
  }

  setTaskStatuses(taskStatuses: TaskStatusConfig[]): void {
    this.props.taskStatuses = taskStatuses;
    this.props.updatedAt = new Date();
  }

  setStorage(storage: CloudStorageConfig): void {
    this.props.storage = storage;
    this.props.updatedAt = new Date();
  }
}
