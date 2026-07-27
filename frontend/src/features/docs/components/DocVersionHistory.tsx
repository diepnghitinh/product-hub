import { useEffect, useState } from 'react';
import { ChevronLeft, History, RotateCcw } from 'lucide-react';
import { Button, Dialog, Input, RichText } from '@/components/ui';
import { ListSkeleton } from '@/components/Skeletons';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { DocPageDto, DocPageVersionSummary } from '@/types/dto';
import {
  useDocPageVersion,
  useDocPageVersions,
  useRestoreDocPageVersion,
  useSaveDocPageVersion,
} from '../api';

interface DocVersionHistoryProps {
  open: boolean;
  onClose: () => void;
  page: DocPageDto;
  canWrite: boolean;
  /** Called after a restore lands, with the page as the server rewrote it. */
  onRestored: (page: DocPageDto) => void;
}

/** A version's own name, or the moment it was taken — a row always reads as something. */
function versionLabel(version: DocPageVersionSummary): string {
  return version.label || formatDateTime(version.createdAt);
}

/**
 * A page's history: every saved version on the left, the one you picked rendered
 * read-only on the right. Restoring writes the old body back onto the live page —
 * and because the server snapshots the current one first, changing your mind
 * costs nothing.
 *
 * Two panes on desktop; on a phone the list and the preview take turns, since
 * neither is readable at half a phone's width.
 */
export function DocVersionHistory({
  open,
  onClose,
  page,
  canWrite,
  onRestored,
}: DocVersionHistoryProps) {
  const { data, isLoading } = useDocPageVersions(page.docId, page.id, open);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const save = useSaveDocPageVersion();
  const restore = useRestoreDocPageVersion();

  const versions = data ?? [];
  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const { data: preview, isLoading: previewLoading } = useDocPageVersion(
    page.docId,
    page.id,
    selectedId ?? undefined,
  );

  // Open on the newest version rather than an empty pane — that's the one you
  // came to look at nine times out of ten.
  useEffect(() => {
    if (!open) return;
    setSelectedId((current) =>
      current && versions.some((v) => v.id === current) ? current : (versions[0]?.id ?? null),
    );
  }, [open, versions]);

  // Reopening should start clean, not with the last save's name still typed in.
  useEffect(() => {
    if (!open) setLabel('');
  }, [open]);

  function saveVersion() {
    save.mutate(
      { docId: page.docId, pageId: page.id, label: label.trim() || undefined },
      {
        onSuccess: (created) => {
          setLabel('');
          setSelectedId(created.id);
        },
      },
    );
  }

  function restoreSelected() {
    if (!selected) return;
    if (!confirm(t('docs.confirmRestore'))) return;
    restore.mutate(
      { docId: page.docId, pageId: page.id, versionId: selected.id },
      {
        onSuccess: (restored) => {
          onRestored(restored);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('docs.versionHistory')}
      fullscreenKey="doc-versions"
      className="sm:max-w-4xl"
    >
      <div className="flex h-[70vh] min-h-0 flex-col gap-3 md:flex-row">
        {/* List — hidden on mobile once a version is open, so the preview gets
            the full width back. */}
        <div
          className={cn(
            'flex min-h-0 flex-col md:w-64 md:shrink-0 md:border-r md:pr-3',
            selectedId && 'max-md:hidden',
          )}
        >
          {canWrite && (
            <div className="mb-2 flex gap-1.5">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder={t('docs.versionLabelPlaceholder')}
                aria-label={t('docs.versionLabel')}
                className="h-8 text-[13px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveVersion();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0"
                loading={save.isPending}
                onClick={saveVersion}
              >
                {t('docs.saveVersion')}
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <ListSkeleton rows={4} />
            ) : versions.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                {t('docs.noVersions')}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(version.id)}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                        version.id === selectedId ? 'bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <span className="block truncate text-[13px] font-medium">
                        {versionLabel(version)}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {version.createdByName || '—'} · {timeAgo(version.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className={cn('flex min-h-0 flex-1 flex-col', !selectedId && 'max-md:hidden')}>
          {!selected ? (
            <div className="grid flex-1 place-items-center text-center">
              <div>
                <History className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden />
                <p className="text-sm text-muted-foreground">{t('docs.pickVersion')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start gap-2 border-b pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 md:hidden"
                  aria-label={t('common.back')}
                  onClick={() => setSelectedId(null)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selected.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t('docs.versionSavedBy')
                      .replace('{name}', selected.createdByName || '—')
                      .replace('{when}', formatDateTime(selected.createdAt))}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 gap-1.5"
                    loading={restore.isPending}
                    onClick={restoreSelected}
                  >
                    <RotateCcw className="size-3.5" /> {t('docs.restoreVersion')}
                  </Button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/20 p-3">
                {previewLoading || !preview ? (
                  <ListSkeleton rows={6} />
                ) : preview.content ? (
                  <RichText html={preview.content} className="text-sm" />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('docs.versionEmpty')}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
