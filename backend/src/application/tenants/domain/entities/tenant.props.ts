import { UniqueEntityID } from '@core/domain';

export enum TenantStatus {
  ACTIVE = 'active',
  /** Kept intact, but nobody in it can sign in. Reversible. */
  SUSPENDED = 'suspended',
}

export const TENANT_STATUSES: TenantStatus[] = [
  TenantStatus.ACTIVE,
  TenantStatus.SUSPENDED,
];

export interface TenantProps {
  id: UniqueEntityID;
  name: string;
  /** Short human-friendly handle for the workspace (`acme`). Optional — nothing
   *  routes on it yet; it exists so the platform console can label tenants by
   *  something shorter and more stable than the name. */
  slug?: string | null;
  status: TenantStatus;
  /** Who the vendor talks to about this workspace. Not an app login. */
  contactEmail?: string | null;
  /** Operator-only scratchpad; never shown to the tenant. */
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
