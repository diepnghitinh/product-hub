import { useEffect, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { Badge, Button, Dialog, Field, TagInput } from '@/components/ui';
import { t } from '@/i18n';

interface DocTagsBarProps {
  tags: string[];
  canWrite: boolean;
  saving?: boolean;
  /** Replaces the whole list — resolves once the save has landed. */
  onSave: (tags: string[]) => Promise<unknown>;
}

/**
 * A doc's tags as chips, at the top of its page rail: doc-level metadata in the
 * doc-level column, so the writing surface beside it stays clean. Editing them
 * here means a writer doesn't have to go back to the hub's ⋯ menu to tag what
 * they're already reading — same `TagInput`, same 20-tag cap.
 *
 * Renders nothing when there's nothing to show and nothing to add, so a reader
 * on an untagged doc gets no empty furniture.
 */
export function DocTagsBar({ tags, canWrite, saving, onSave }: DocTagsBarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);

  // Opening starts from what's saved, not from an edit that was abandoned.
  useEffect(() => {
    if (open) setDraft(tags);
  }, [open, tags]);

  if (!tags.length && !canWrite) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Stay open if the save fails, so the edit isn't silently lost.
    await onSave(draft);
    setOpen(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="font-normal">
            {tag}
          </Badge>
        ))}
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-input px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {tags.length ? (
              <Plus className="size-3" aria-hidden />
            ) : (
              <Tag className="size-3" aria-hidden />
            )}
            {tags.length ? t('docs.addTag') : t('docs.tags')}
          </button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('docs.editTags')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="doc-tags-form" type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="doc-tags-form" onSubmit={submit}>
          <Field label={t('docs.tags')} htmlFor="doc-tags-edit">
            <TagInput
              id="doc-tags-edit"
              value={draft}
              onChange={setDraft}
              maxTags={20}
              placeholder={t('docs.tagsPlaceholder')}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
