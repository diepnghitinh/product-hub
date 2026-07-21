import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button, Dialog, Input, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { t } from '@/i18n';
import { IssueKind } from '@/types/enums';

interface PickIssueDialogProps {
  open: boolean;
  onClose: () => void;
  /** Which collection to search — tasks or bugs (same-type links). */
  subject: IssueKind;
  /** Ids to hide (at least the source issue itself). */
  excludeIds: string[];
  /** Dialog title — the relation label, e.g. "Blocked by". */
  title: string;
  onPick: (targetId: string) => void;
  pending?: boolean;
}

interface PickerIssue {
  id: string;
  shortId: string;
  title: string;
}

/**
 * Pick an existing same-type issue to link. Search runs server-side over title,
 * description and shortId, so pasting a TSK-5 / BUG-12 resolves straight to it.
 * The PickTaskDialog shape, but generic over task vs bug.
 */
export function PickIssueDialog({
  open,
  onClose,
  subject,
  excludeIds,
  title,
  onPick,
  pending,
}: PickIssueDialogProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const path = subject === IssueKind.TASK ? '/tasks' : '/bugs';
  const { data, isLoading } = useQuery({
    queryKey: ['issue-picker', subject, search],
    queryFn: () =>
      apiGet<{ items: PickerIssue[] }>(path, { limit: 20, ...(search ? { search } : {}) }),
    enabled: open,
  });

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const issues = (data?.items ?? []).filter((it) => !exclude.has(it.id));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-xl"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('relations.search')}
            aria-label={t('relations.search')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[50vh] min-h-32 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : issues.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? t('relations.empty') : t('relations.none')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {issues.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onPick(it.id)}
                    disabled={pending}
                    className="flex w-full items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {it.shortId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
