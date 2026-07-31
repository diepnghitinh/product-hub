import { UniqueEntityID } from '@core/domain';
import { FeatureMap } from '../features';

export interface PlanProps {
  id: UniqueEntityID;
  /** Stable identifier used by subscriptions and inheritance (`free`, `pro`…). */
  code: string;
  name: string;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  /** This plan's own grants only — sparse. Resolve with the base chain to get
   *  what a subscriber actually receives. */
  features: FeatureMap;
  /** Code of the plan this one builds on, or null for a root plan. */
  extendsCode?: string | null;
  /** Hidden plans stay assignable by the operator but aren't public pricing. */
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
