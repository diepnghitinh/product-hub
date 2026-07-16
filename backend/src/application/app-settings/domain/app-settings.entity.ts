import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { BugStatusConfig, DEFAULT_BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { WebhookConfig } from './webhook.types';

interface AppSettingsProps {
  tenantId: string;
  webhooks: WebhookConfig[];
  bugStatuses: BugStatusConfig[];
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
      bugStatuses?: BugStatusConfig[];
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
          webhooks: props.webhooks ?? [],
          // Fall back to the shipped defaults for tenants that predate the field.
          bugStatuses: props.bugStatuses?.length ? props.bugStatuses : DEFAULT_BUG_STATUSES,
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
  get bugStatuses(): BugStatusConfig[] {
    return this.props.bugStatuses;
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

  setBugStatuses(bugStatuses: BugStatusConfig[]): void {
    this.props.bugStatuses = bugStatuses;
    this.props.updatedAt = new Date();
  }
}
