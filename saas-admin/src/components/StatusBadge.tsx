import { Badge } from '@/components/ui/badge';
import type { SubscriptionStatus, TenantStatus } from '@/lib/types';

/** Workspace state. Suspended is the only thing that stops a login, so it shouts. */
export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return status === 'suspended' ? (
    <Badge variant="destructive">Suspended</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

const SUB_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus | null }) {
  // No row at all is a real state — a workspace nobody has put on a plan yet.
  if (!status) return <Badge variant="outline">No plan</Badge>;
  const variant = (
    {
      trial: 'info',
      active: 'success',
      past_due: 'warning',
      canceled: 'muted',
    } as const
  )[status];
  return <Badge variant={variant}>{SUB_LABEL[status]}</Badge>;
}
