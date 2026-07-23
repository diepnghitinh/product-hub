import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiPatch } from '@/lib/api';
import { t } from '@/i18n';

/**
 * One bulk operation over a set of issue ids. Each variant maps to the exact
 * single-issue endpoint the detail view already uses, so every server-side guard
 * — a cycle must belong to the issue's own team and not be completed, an assignee
 * must exist, a status must be a real column — is reused as-is, per issue. There
 * is deliberately no bulk endpoint: fanning out over the validated path keeps the
 * rules in one place (see `update-issue.use-case`).
 */
export type BulkIssueAction =
  | { type: 'cycle'; cycleId: string } // a cycle id joins; '' removes from its cycle
  | { type: 'status'; status: string }
  | { type: 'assignee'; assigneeId: string } // a user id assigns; '' unassigns
  | { type: 'delete' };

/** How many issues to write at once — enough to feel instant on a normal
 *  selection, capped so a 100-row select-all can't open 100 sockets in a burst. */
const CONCURRENCY = 6;

function requestFor(action: BulkIssueAction): (id: string) => Promise<unknown> {
  switch (action.type) {
    case 'cycle':
      return (id) => apiPatch(`/issues/${id}`, { cycleId: action.cycleId });
    case 'assignee':
      return (id) => apiPatch(`/issues/${id}`, { assigneeId: action.assigneeId });
    case 'status':
      return (id) => apiPatch(`/issues/${id}/status`, { status: action.status });
    case 'delete':
      return (id) => apiDelete(`/issues/${id}`);
  }
}

/** Run `op` over every id with a small concurrency pool, collecting per-item
 *  outcomes so one failure never aborts the rest (a completed cycle rejecting a
 *  single issue shouldn't strand the other 20). */
async function runPooled(
  ids: string[],
  op: (id: string) => Promise<unknown>,
): Promise<{ ok: number; failed: number; firstError?: string }> {
  let cursor = 0;
  let ok = 0;
  const errors: string[] = [];
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await op(id);
        ok++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return { ok, failed: errors.length, firstError: errors[0] };
}

/**
 * Every issue board caches under its own namespace (`issues` / `tasks` / `bugs`,
 * plus the open detail keys), and a cycle move also shifts cycle membership and
 * stats — so after a bulk write, refresh all of them. Exported so the caller can
 * reuse it if it composes its own follow-up writes.
 */
export function invalidateAllIssueCaches(qc: QueryClient) {
  for (const key of ['issues', 'tasks', 'bugs', 'issue', 'task', 'bug', 'cycles', 'cycle-burndown']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Apply one {@link BulkIssueAction} to many issues at once — the write behind the
 * List view's bulk toolbar. A react-query mutation like every other board write:
 * it fans out, then invalidates the issue caches so the lists reconcile. Reports
 * the outcome as a toast (partial failures included) and returns the counts so
 * the caller can, e.g., clear its selection only on full success.
 */
export function useBulkIssueAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkIssueAction }) =>
      runPooled(ids, requestFor(action)),
    onSuccess: ({ ok, failed, firstError }, { action }) => {
      invalidateAllIssueCaches(qc);
      const verb = action.type === 'delete' ? t('bulk.deleted') : t('bulk.updated');
      if (failed === 0) {
        toast.success(`${ok} ${verb}`);
      } else {
        toast.warning(`${ok} ${verb}, ${failed} ${t('bulk.failed')}`, { description: firstError });
      }
    },
    onError: (err) => toast.error(t('bulk.error'), { description: err.message }),
  });
}
