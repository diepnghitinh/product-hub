import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { t } from '@/i18n';
import { IssueKind, RELATION_TYPES, RELATION_TYPE_LABEL } from '@/types/enums';
import { useDeleteIssueRelation, useIssueRelations } from './relations.api';

/**
 * The linked-issues list in a task/bug detail sidebar. Grouped by relation type
 * ("Blocked by", "Related to"…), each row links to the issue and — for editors —
 * offers an × to unlink. Renders nothing when the issue has no relations.
 */
export function IssueRelations({
  subject,
  issueId,
  canWrite,
}: {
  subject: IssueKind;
  issueId: string;
  canWrite: boolean;
}) {
  const { data: relations } = useIssueRelations(subject, issueId);
  const del = useDeleteIssueRelation();

  if (!relations?.length) return null;

  const groups = RELATION_TYPES.map((type) => ({
    type,
    items: relations.filter((r) => r.relationType === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('relations.title')}
      </span>
      {groups.map((g) => (
        <div key={g.type} className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            {RELATION_TYPE_LABEL[g.type]}
          </span>
          {g.items.map((r) => (
            <div
              key={r.id}
              className="group flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
            >
              <Link
                to={`/${r.issueType === IssueKind.BUG ? 'bugs' : 'tasks'}/${r.targetShortId || r.targetId}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                title={r.targetTitle}
              >
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {r.targetShortId}
                </span>
                <span className="truncate">{r.targetTitle}</span>
              </Link>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => del.mutate({ id: r.id, issueType: subject, issueId })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  aria-label={t('relations.remove')}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
