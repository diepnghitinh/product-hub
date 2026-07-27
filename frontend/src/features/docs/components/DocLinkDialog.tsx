import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button, Dialog, Input, Spinner, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { t } from '@/i18n';
import { DocLinkKind, IssueKind } from '@/types/enums';
import type { DocLink } from '@/types/dto';
import { useRoadmaps } from '@/features/roadmaps/api';

interface PickerIssue {
  id: string;
  kind: IssueKind;
  shortId: string;
  title: string;
}

interface DocLinkDialogProps {
  open: boolean;
  onClose: () => void;
  /** Already-linked refIds, hidden from the list so nothing is linked twice. */
  linkedIds: string[];
  onPick: (link: DocLink) => void;
  pending?: boolean;
}

/**
 * Attaches this page to a work item — a task/bug or a roadmap item. The chosen
 * record's title is stored alongside its id (a snapshot, like a favourite's), so
 * the chip renders without a second fetch and the link survives on both ends.
 */
export function DocLinkDialog({ open, onClose, linkedIds, onPick, pending }: DocLinkDialogProps) {
  const [kind, setKind] = useState<DocLinkKind>(DocLinkKind.ISSUE);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearch('');
    }
  }, [open]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const issues = useQuery({
    queryKey: ['doc-link-issues', search],
    queryFn: () =>
      apiGet<{ items: PickerIssue[] }>('/issues', { limit: 20, ...(search ? { search } : {}) }),
    enabled: open && kind === DocLinkKind.ISSUE,
  });

  // Roadmap items ride along with their roadmap, so one list covers every board.
  const roadmaps = useRoadmaps();

  const exclude = useMemo(() => new Set(linkedIds), [linkedIds]);

  const roadmapOptions = useMemo(() => {
    const q = search.toLowerCase();
    return (roadmaps.data ?? [])
      .flatMap((r) => r.items.map((item) => ({ item, roadmap: r })))
      .filter(
        ({ item }) => !exclude.has(item.id) && (!q || item.title.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [roadmaps.data, search, exclude]);

  const issueOptions = (issues.data?.items ?? []).filter((it) => !exclude.has(it.id));
  const loading = kind === DocLinkKind.ISSUE ? issues.isLoading : roadmaps.isLoading;

  const rowClass =
    'flex w-full items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('docs.linkTitle')}
      className="max-w-xl"
      footer={
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as DocLinkKind)}>
          <TabsList className="w-full">
            <TabsTrigger value={DocLinkKind.ISSUE} className="flex-1">
              {t('docs.linkIssue')}
            </TabsTrigger>
            <TabsTrigger value={DocLinkKind.ROADMAP_ITEM} className="flex-1">
              {t('docs.linkRoadmap')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : kind === DocLinkKind.ISSUE ? (
            issueOptions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('docs.linkEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {issueOptions.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      disabled={pending}
                      className={rowClass}
                      onClick={() =>
                        onPick({
                          kind: DocLinkKind.ISSUE,
                          refId: it.id,
                          title: it.title,
                          roadmapId: '',
                          issueKind: it.kind,
                        })
                      }
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {it.shortId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : roadmapOptions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('docs.linkEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {roadmapOptions.map(({ item, roadmap }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={pending}
                    className={rowClass}
                    onClick={() =>
                      onPick({
                        kind: DocLinkKind.ROADMAP_ITEM,
                        refId: item.id,
                        title: item.title,
                        roadmapId: roadmap.id,
                        issueKind: '',
                      })
                    }
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                      {roadmap.title}
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
