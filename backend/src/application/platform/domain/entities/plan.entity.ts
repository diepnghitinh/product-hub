import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { FeatureMap } from '../features';
import { PlanProps } from './plan.props';

/** `code` is what subscriptions and `extendsCode` point at, so keep it URL-safe. */
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const DEFAULT_CURRENCY = 'USD';

/**
 * A sellable package of entitlements.
 *
 * Inheritance is *live*, not copied: a plan stores only its own grants plus the
 * `extendsCode` of its base. Editing the base changes every plan built on it,
 * which is the point — "Pro is Free plus X" stays true after Free changes.
 */
export class PlanEntity extends AggregateRoot<PlanProps> {
  private constructor(props: PlanProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      code: string;
      name: string;
      description?: string | null;
      priceMonthly?: number;
      priceYearly?: number;
      currency?: string;
      features?: FeatureMap;
      extendsCode?: string | null;
      isActive?: boolean;
      sortOrder?: number;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<PlanEntity> {
    const codeGuard = Guard.againstEmptyString(props.code, 'code');
    if (!codeGuard.succeeded) return Result.fail(codeGuard.message);

    const code = props.code.trim().toLowerCase();
    if (!CODE_PATTERN.test(code)) {
      return Result.fail('code may only contain lowercase letters, numbers and dashes');
    }

    const nameGuard = Guard.againstEmptyString(props.name, 'name');
    if (!nameGuard.succeeded) return Result.fail(nameGuard.message);

    if (props.extendsCode && props.extendsCode.trim().toLowerCase() === code) {
      return Result.fail('A plan cannot extend itself');
    }

    const now = new Date();
    return Result.ok(
      new PlanEntity(
        {
          id: id || new UniqueEntityID(),
          code,
          name: props.name.trim(),
          description: props.description?.trim() || null,
          priceMonthly: Math.max(0, props.priceMonthly ?? 0),
          priceYearly: Math.max(0, props.priceYearly ?? 0),
          currency: (props.currency || DEFAULT_CURRENCY).toUpperCase(),
          features: props.features ?? {},
          extendsCode: props.extendsCode?.trim().toLowerCase() || null,
          isActive: props.isActive ?? true,
          sortOrder: props.sortOrder ?? 0,
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
  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description ?? null;
  }
  get priceMonthly(): number {
    return this.props.priceMonthly;
  }
  get priceYearly(): number {
    return this.props.priceYearly;
  }
  get currency(): string {
    return this.props.currency;
  }
  get features(): FeatureMap {
    return this.props.features;
  }
  get extendsCode(): string | null {
    return this.props.extendsCode ?? null;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get sortOrder(): number {
    return this.props.sortOrder;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Patch the editable fields. `code` is identity and never changes. */
  update(patch: {
    name?: string;
    description?: string | null;
    priceMonthly?: number;
    priceYearly?: number;
    currency?: string;
    features?: FeatureMap;
    extendsCode?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  }): Result<void> {
    if (patch.name !== undefined) {
      const guard = Guard.againstEmptyString(patch.name, 'name');
      if (!guard.succeeded) return Result.fail(guard.message);
      this.props.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description?.trim() || null;
    }
    if (patch.priceMonthly !== undefined) {
      this.props.priceMonthly = Math.max(0, patch.priceMonthly);
    }
    if (patch.priceYearly !== undefined) {
      this.props.priceYearly = Math.max(0, patch.priceYearly);
    }
    if (patch.currency !== undefined) {
      this.props.currency = (patch.currency || DEFAULT_CURRENCY).toUpperCase();
    }
    if (patch.features !== undefined) {
      this.props.features = patch.features;
    }
    if (patch.extendsCode !== undefined) {
      const base = patch.extendsCode?.trim().toLowerCase() || null;
      if (base === this.props.code) return Result.fail('A plan cannot extend itself');
      this.props.extendsCode = base;
    }
    if (patch.isActive !== undefined) {
      this.props.isActive = patch.isActive;
    }
    if (patch.sortOrder !== undefined) {
      this.props.sortOrder = patch.sortOrder;
    }
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
