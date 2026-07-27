import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MoreHorizontal, Share2, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Menu,
  type MenuItem,
  SymbolPicker,
  TagInput,
} from '@/components/ui';
import { CardGridSkeleton } from '@/components/Skeletons';
import { FilterMenu, type FilterSelections } from '@/components/FilterMenu';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { TeamSymbol, TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { CenteredPageLayout } from '@/layouts/shared';
import { timeAgo } from '@/lib/format';
import { t } from '@/i18n';
import { TEAM_COLORS } from '@/types/enums';
import type { DocDto } from '@/types/dto';
import { useCreateDoc, useDeleteDoc, useDocs, useSetDocSharing, useUpdateDoc } from './api';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

/** The one filter category on this hub — `FilterSelections` is keyed by it. */
const TAG_FILTER = 'tags';
/** Tags are matched case-insensitively, so both sides go through this. */
const tagKey = (tag: string) => tag.toLowerCase();

/**
 * Every doc in the workspace, as cards. A doc is a container of pages, so a card
 * shows how many it holds and when it last moved — opening one goes to the
 * two-pane workspace where the writing happens.
 */
export function DocsHubPage() {
  const navigate = useNavigate();
  const { canWrite, canManageDelivery } = useAuth();
  const { data, isLoading } = useDocs();
  const create = useCreateDoc();
  const update = useUpdateDoc();
  const remove = useDeleteDoc();
  const setSharing = useSetDocSharing();

  const [open, setOpen] = useState(false);
  /** null = creating; a doc = editing that card's title + icon. */
  const [editing, setEditing] = useState<DocDto | null>(null);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('book');
  const [color, setColor] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [sharing, setSharingDoc] = useState<DocDto | null>(null);
  const [filters, setFilters] = useState<FilterSelections>({});

  const docs = useMemo(() => data ?? [], [data]);
  // Re-read the shared doc from the list so the dialog's switch follows the
  // mutation instead of showing the state it was opened with.
  const shareTarget = sharing ? (docs.find((d) => d.id === sharing.id) ?? sharing) : null;

  // Every tag in use, deduped case-insensitively (first spelling wins, matching
  // the server) — the filter's options are whatever the workspace has written.
  const allTags = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const doc of docs) {
      for (const tag of doc.tags ?? []) if (!byKey.has(tagKey(tag))) byKey.set(tagKey(tag), tag);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [docs]);

  // Filtered here rather than on the server: the hub already holds every doc in
  // one query, so a round-trip per checkbox would only be slower.
  const selectedTags = filters[TAG_FILTER] ?? [];
  const visible = useMemo(() => {
    if (!selectedTags.length) return docs;
    const wanted = new Set(selectedTags);
    // Any of the picked tags matches — the usual "narrow, don't intersect".
    return docs.filter((doc) => (doc.tags ?? []).some((tag) => wanted.has(tagKey(tag))));
  }, [docs, selectedTags]);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setIcon('book');
    setColor(null);
    setTags([]);
    setOpen(true);
  }

  function openEdit(doc: DocDto) {
    setEditing(doc);
    setTitle(doc.title);
    setIcon(doc.icon || 'book');
    setColor(doc.color ?? null);
    setTags(doc.tags ?? []);
    setOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    if (editing) {
      update.mutate(
        { id: editing.id, input: { title: name, icon, color, tags } },
        { onSuccess: () => setOpen(false) },
      );
    } else {
      create.mutate(
        { title: name, icon, color, tags },
        {
          onSuccess: (doc) => {
            setOpen(false);
            // A new doc is created with its first page — go straight to writing.
            navigate(`/docs/${doc.id}`);
          },
        },
      );
    }
  }

  const saving = editing ? update.isPending : create.isPending;

  return (
    <CenteredPageLayout>
      <PageHeader
        title={t('docs.title')}
        actions={canWrite ? <Button onClick={openCreate}>+ {t('docs.new')}</Button> : undefined}
      />

      {/* Only what narrows the list, and only once there's something to narrow by. */}
      {allTags.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <FilterMenu
            categories={[
              {
                id: TAG_FILTER,
                label: t('docs.tags'),
                icon: <Tag className="size-4" />,
                searchable: allTags.length > 8,
                options: allTags.map((tag) => ({ id: tagKey(tag), label: tag })),
              },
            ]}
            value={filters}
            onChange={setFilters}
          />
          {selectedTags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {visible.length} / {docs.length}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FileText className="mx-auto mb-3 size-7 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {docs.length === 0 ? t('docs.empty') : t('docs.noTagMatch')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            {docs.length === 0 ? t('docs.emptyHint') : t('docs.noTagMatchHint')}
          </p>
        </div>
      ) : (
        <div className={CARD_GRID}>
          {visible.map((doc) => {
            const items: MenuItem[] = [
              ...(canWrite
                ? [{ label: t('docs.edit'), onClick: () => openEdit(doc), closeOnSelect: true }]
                : []),
              ...(canManageDelivery
                ? [
                    {
                      label: t('docs.share'),
                      icon: <Share2 className="size-4" />,
                      closeOnSelect: true,
                      onClick: () => setSharingDoc(doc),
                    },
                    {
                      label: t('docs.delete'),
                      icon: <Trash2 className="size-4" />,
                      danger: true,
                      onClick: () => {
                        if (confirm(t('docs.confirmDelete'))) remove.mutate(doc.id);
                      },
                    },
                  ]
                : []),
            ];

            return (
              <article
                key={doc.id}
                className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/20"
                onClick={() => navigate(`/docs/${doc.id}`)}
              >
                <div className="flex items-start gap-2.5 pr-8">
                  <span className="mt-px grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <TeamSymbol name={doc.icon || 'book'} size={16} color={doc.color ?? undefined} />
                  </span>
                  <h3 className="min-w-0 text-[15px] font-medium leading-tight">{doc.title}</h3>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('docs.createdBy').replace('{name}', doc.createdByName || '—')}
                </p>

                {(doc.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>
                    {doc.pageCount} {doc.pageCount === 1 ? t('docs.onePage') : t('docs.pages')}
                  </span>
                  <span>{timeAgo(doc.updatedAt)}</span>
                </div>

                {items.length > 0 && (
                  // Always visible on touch, where there's no hover to reveal it.
                  <span
                    className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                    onClick={(e) => e.stopPropagation()} // don't open the doc
                  >
                    <Menu
                      align="right"
                      items={items}
                      triggerClassName="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      trigger={
                        <>
                          <MoreHorizontal className="size-4" aria-hidden />
                          <span className="sr-only">{t('common.more')}</span>
                        </>
                      }
                    />
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('docs.edit') : t('docs.create')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="doc-create" type="submit" loading={saving}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="doc-create" onSubmit={submit}>
          <Field label={t('docs.docTitle')} htmlFor="doc-title">
            <div className="flex items-center gap-2">
              <SymbolPicker
                value={icon}
                color={color}
                options={TEAM_SYMBOL_NAMES}
                colors={TEAM_COLORS}
                ariaLabel={t('docs.icon')}
                onChange={(patch) => {
                  if (patch.icon !== undefined) setIcon(patch.icon);
                  if (patch.color !== undefined) setColor(patch.color);
                }}
              />
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </div>
          </Field>
          <Field label={t('docs.tags')} htmlFor="doc-tags">
            <TagInput
              id="doc-tags"
              value={tags}
              onChange={setTags}
              maxTags={20}
              placeholder={t('docs.tagsPlaceholder')}
            />
          </Field>
        </form>
      </Dialog>

      {shareTarget && (
        <ShareLinkDialog
          open={!!sharing}
          onClose={() => setSharingDoc(null)}
          title={t('docs.share')}
          hint={t('docs.shareHint')}
          publicPath="docs"
          enabled={shareTarget.publicEnabled}
          publicToken={shareTarget.publicToken}
          pending={setSharing.isPending}
          onToggle={(enabled) => setSharing.mutate({ id: shareTarget.id, enabled })}
        />
      )}
    </CenteredPageLayout>
  );
}
