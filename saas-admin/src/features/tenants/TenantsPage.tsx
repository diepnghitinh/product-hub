import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/DataState';
import { PageHeader } from '@/components/PageHeader';
import { SubscriptionStatusBadge, TenantStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { formatDate, formatNumber } from '@/lib/format';
import { useTenants } from '@/lib/queries';
import type { TenantStatus } from '@/lib/types';
import { CreateTenantDialog } from './CreateTenantDialog';

const ALL = '__all__';
const LIMIT = 25;

export function TenantsPage() {
  const navigate = useNavigate();
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  // Debounce the search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(rawSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [rawSearch]);

  // Any narrowing invalidates the current page number — page 4 of a 2-page
  // result is an empty table with no way back other than the pager.
  useEffect(() => setPage(1), [search, status]);

  const params = useMemo(
    () => ({
      page,
      limit: LIMIT,
      ...(search ? { search } : {}),
      ...(status !== ALL ? { status: status as TenantStatus } : {}),
    }),
    [page, search, status],
  );

  const { data, isPending, error, refetch } = useTenants(params);

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Every tenant on this deployment."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New workspace
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Search name, slug or contact email"
          icon={<Search />}
          className="sm:max-w-sm"
        />
        <SelectMenu value={status} onValueChange={setStatus}>
          <SelectMenuTrigger className="sm:w-40">
            <SelectMenuValue />
          </SelectMenuTrigger>
          <SelectMenuContent>
            <SelectMenuItem value={ALL}>All statuses</SelectMenuItem>
            <SelectMenuItem value="active">Active</SelectMenuItem>
            <SelectMenuItem value="suspended">Suspended</SelectMenuItem>
          </SelectMenuContent>
        </SelectMenu>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={8} cols={6} />
      ) : data.data.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title={search || status !== ALL ? 'No workspaces match' : 'No workspaces yet'}
          description={
            search || status !== ALL
              ? 'Try a different search or clear the status filter.'
              : 'Create the first one to get started.'
          }
          action={
            search || status !== ALL ? (
              <Button
                variant="outline"
                onClick={() => {
                  setRawSearch('');
                  setStatus(ALL);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New workspace
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Table from `md` up. Below that the same rows render as cards —
              a 7-column table on a phone is unreadable at any font size. */}
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Workspace</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Plan</th>
                  <th className="px-4 py-2.5 text-right font-medium">People</th>
                  <th className="px-4 py-2.5 text-right font-medium">Issues</th>
                  <th className="px-4 py-2.5 text-right font-medium">Docs</th>
                  <th className="px-4 py-2.5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tenants/${t.id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    {/* w-full + max-w-0 is what makes truncation land here and not
                        somewhere arbitrary: the other columns size to their content
                        and the name column absorbs whatever is left. */}
                    <td className="w-full max-w-0 px-4 py-3">
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.slug ? `/${t.slug}` : t.contactEmail || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <TenantStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{t.planName ?? '—'}</span>
                        <SubscriptionStatusBadge status={t.subscriptionStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(t.userCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(t.issueCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(t.docCount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {data.data.map((t) => (
              <Link
                key={t.id}
                to={`/tenants/${t.id}`}
                className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.slug ? `/${t.slug}` : t.contactEmail || '—'}
                    </p>
                  </div>
                  <TenantStatusBadge status={t.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <SubscriptionStatusBadge status={t.subscriptionStatus} />
                  {t.planName && <span>{t.planName}</span>}
                  <span>· {formatNumber(t.userCount)} people</span>
                  <span>· {formatNumber(t.issueCount)} issues</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {formatNumber(data.total)} workspace{data.total === 1 ? '' : 's'} · page {data.page}{' '}
              of {Math.max(1, data.totalPages)}
            </p>
            {data.totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <CreateTenantDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/tenants/${id}`)}
      />
    </>
  );
}
