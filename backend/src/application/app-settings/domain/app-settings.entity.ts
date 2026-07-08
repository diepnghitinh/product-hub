import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { WebhookConfig } from './webhook.types';

interface AppSettingsProps {
  tenantId: string;
  webhooks: WebhookConfig[];
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
    props: { tenantId: string; webhooks?: WebhookConfig[]; createdAt?: Date; updatedAt?: Date },
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
}
