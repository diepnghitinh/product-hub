import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MoreHorizontal, Share2, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
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
import { DocTagChip } from './components/DocTagChip';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { TeamSymbol, TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { CenteredPageLayout } from '@/layouts/shared';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { isFavourited, useFavourites } from '@/features/favourites/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { FavouriteKind, TEAM_COLORS } from '@/types/enums';
import type { DocDto } from '@/types/dto';
import { useCreateDoc, useDeleteDoc, useDocs, useSetDocSharing, useUpdateDoc } from './api';
import { docPath } from './slug';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

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
  // Shared cache with the sidebar — read here only to decide which stars stay
  // visible without a hover.
  const { data: favourites } = useFavourites();
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
  /** Lower-cased tag keys, not labels — see `tagKey`. */
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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

  const toggleTag = (tag: string) =>
    setSelectedTags((current) =>
      current.includes(tagKey(tag))
        ? current.filter((k) => k !== tagKey(tag))
        : [...current, tagKey(tag)],
    );

  // Filtered here rather than on the server: the hub already holds every doc in
  // one query, so a round-trip per chip would only be slower.
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
            navigate(docPath(doc));
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

      {/*
        Every tag in the workspace, laid out as chips rather than hidden behind a
        dropdown: the list doubles as the hub's vocabulary, so you can see what's
        here before deciding to narrow it. Wraps on a phone.
      */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Tag className="mr-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {allTags.map((tag) => (
            <DocTagChip
              key={tagKey(tag)}
              tag={tag}
              selected={selectedTags.includes(tagKey(tag))}
              onClick={() => toggleTag(tag)}
            />
          ))}
          {selectedTags.length > 0 && (
            <>
              <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                {visible.length} / {docs.length}
              </span>
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {t('filters.clearAll')}
              </button>
            </>
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
                onClick={() => navigate(docPath(doc))}
              >
                {/* Right padding clears the action cluster in the corner — two
                    controls wide now that the pin sits beside the ⋯ menu. */}
                <div className="flex items-start gap-2.5 pr-14">
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
                      <DocTagChip key={tag} tag={tag} />
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>
                    {doc.pageCount} {doc.pageCount === 1 ? t('docs.onePage') : t('docs.pages')}
                  </span>
                  <span>{timeAgo(doc.updatedAt)}</span>
                </div>

                {/* Card actions — pin, then the ⋯ menu. Revealed on hover, and
                    always visible on touch, where there's no hover to reveal
                    them. A *pinned* star stays visible whatever the pointer is
                    doing: the hub should say at a glance which docs are already
                    in your sidebar. */}
                <span
                  className="absolute right-2 top-2 flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()} // don't open the doc
                >
                  <FavouriteButton
                    kind={FavouriteKind.DOC}
                    refId={doc.id}
                    title={doc.title}
                    size={15}
                    className={cn(
                      'size-7 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100',
                      !isFavourited(favourites, FavouriteKind.DOC, doc.id) && 'opacity-0',
                    )}
                  />
                  {items.length > 0 && (
                    <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
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
                </span>
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
