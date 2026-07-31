import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { SubscriptionStatusBadge, TenantStatusBadge } from '@/components/StatusBadge';
import { UsageBar } from '@/components/UsageBar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/skeleton';
import { env } from '@/lib/env';
import { formatDate, formatDateTime } from '@/lib/format';
import { useFeatureCatalog, useSetTenantStatus, useSubscriptions, useTenant } from '@/lib/queries';
import { AssignPlanDialog } from '@/features/subscriptions/AssignPlanDialog';
import { EditTenantDialog } from './EditTenantDialog';

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{value ?? '—'}</dd>
    </div>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tenant, isPending, error, refetch } = useTenant(id);
  const { data: subscriptions } = useSubscriptions();
  const { data: catalog } = useFeatureCatalog();
  const setStatus = useSetTenantStatus();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const subscription = subscriptions?.find((s) => s.tenantId === id) ?? null;

  async function toggleSuspend() {
    if (!tenant) return;
    const next = tenant.status === 'suspended' ? 'active' : 'suspended';
    if (
      next === 'suspended' &&
      !window.confirm(
        `Suspend ${tenant.name}?\n\nEveryone in the workspace is signed out and cannot sign back in. Nothing is deleted, and you can undo this at any time.`,
      )
    ) {
      return;
    }
    try {
      await setStatus.mutateAsync({ id: tenant.id, status: next });
      toast.success(next === 'suspended' ? `${tenant.name} suspended` : `${tenant.name} reactivated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the status');
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (isPending) {
    return (
      <>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      </>
    );
  }

  const capabilities = (catalog ?? []).filter((f) => f.type === 'flag');

  return (
    <>
      <Link
        to="/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Workspaces
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tenant.name}
            <TenantStatusBadge status={tenant.status} />
          </span>
        }
        description={tenant.slug ? `/${tenant.slug}` : tenant.contactEmail ?? undefined}
        actions={
          <>
            {env.appUrl && (
              <Button asChild variant="outline">
                <a href={env.appUrl} target="_blank" rel="noreferrer">
                  Open app
                  <ExternalLink />
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
            <Button
              variant={tenant.status === 'suspended' ? 'default' : 'destructive'}
              onClick={toggleSuspend}
              loading={setStatus.isPending}
            >
              {tenant.status === 'suspended' ? <Power /> : <PowerOff />}
              {tenant.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Workspace">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Slug" value={tenant.slug} />
            <Field label="Billing contact" value={tenant.contactEmail} />
            <Field label="Created" value={formatDate(tenant.createdAt)} />
            <Field label="Last change" value={formatDateTime(tenant.updatedAt)} />
          </dl>
          {tenant.notes && (
            <div className="mt-4 rounded-md bg-muted/50 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{tenant.notes}</p>
            </div>
          )}
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Administrators
            </p>
            {tenant.adminEmails.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No admin in this workspace — nobody can manage it from the inside.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {tenant.adminEmails.map((email) => (
                  <li key={email} className="truncate text-sm">
                    {email}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section
          title="Subscription"
          action={
            <Button variant="outline" size="sm" onClick={() => setAssigning(true)}>
              {tenant.planCode ? 'Change plan' : 'Assign a plan'}
            </Button>
          }
        >
          {tenant.planCode ? (
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Plan" value={tenant.planName ?? tenant.planCode} />
              <Field
                label="Status"
                value={<SubscriptionStatusBadge status={tenant.subscriptionStatus} />}
              />
              <Field
                label="Billing"
                value={tenant.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
              />
              <Field label="Period ends" value={formatDate(tenant.currentPeriodEnd)} />
              {subscription && Object.keys(subscription.featureOverrides).length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Overrides
                  </dt>
                  <dd className="mt-1 text-sm">
                    {Object.keys(subscription.featureOverrides).length} feature(s) differ from
                    the plan.
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No plan assigned. The workspace still works — every limit reads as zero until you
              put them on something.
            </p>
          )}
        </Section>
      </div>

      <Section title="Usage">
        <div className="grid gap-5 sm:grid-cols-2">
          {tenant.usage.map((line) => (
            <UsageBar key={line.key} line={line} />
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Counted live from the database. Over a limit is reported, not blocked.
        </p>
      </Section>

      <Section title="Capabilities">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((f) => {
            const on = !!tenant.entitlements[f.key]?.enabled;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 py-1">
                <span className="truncate text-sm">{f.name}</span>
                <span
                  className={
                    on
                      ? 'shrink-0 text-xs font-medium text-success'
                      : 'shrink-0 text-xs text-muted-foreground'
                  }
                >
                  {on ? 'On' : 'Off'}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <EditTenantDialog open={editing} onClose={() => setEditing(false)} tenant={tenant} />
      <AssignPlanDialog
        open={assigning}
        onClose={() => setAssigning(false)}
        tenantId={tenant.id}
        tenantName={tenant.name}
        current={subscription}
      />
    </>
  );
}
