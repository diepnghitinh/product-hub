import { useState } from 'react';
import { Button, MentionTextarea, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import type { CommentDto } from '@/types/dto';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
  type CommentSource,
} from '@/features/activity/api';
import { useMediaAttachments } from '@/features/uploads/useMediaAttachments';
import { AttachMediaButton, AttachmentStrip, CommentMedia } from '@/features/activity/CommentMedia';

export interface Person {
  id: string;
  name: string;
}

/** Initial-in-a-circle avatar used across the activity timeline. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground',
        className,
      )}
      aria-hidden
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export interface CommentThreadProps {
  /** Which thread these comments belong to — bug, task, or roadmap item. */
  source: CommentSource;
  /** People who can be @-mentioned in a comment. */
  users: Person[];
  canWrite: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  /** When provided (a public read-only view), render these instead of fetching
   * the authed thread. */
  comments?: CommentDto[];
}

/**
 * The comment thread — the list of comments plus the composer. Shared verbatim
 * by bug, task, and roadmap-item detail so every thread reads and behaves the
 * same; the only difference is the `source` that routes its API calls and keys
 * its cache. Renders as a fragment so the caller controls the surrounding
 * spacing (e.g. the issue timeline places a creation event above it).
 */
export function CommentThread({
  source,
  users,
  canWrite,
  isAdmin,
  currentUserId,
  comments,
}: CommentThreadProps) {
  // A public viewer passes `comments` directly, so skip the authed fetch entirely.
  const { data: fetched } = useComments(source, comments === undefined);
  const thread = comments ?? fetched ?? [];

  return (
    <>
      {thread.map((c) => (
        <CommentItem
          key={c.id}
          source={source}
          comment={c}
          canEdit={canWrite && (c.authorId === currentUserId || isAdmin)}
        />
      ))}

      {canWrite && <CommentComposer source={source} users={users} />}
    </>
  );
}

/** The comment box: @-mention textarea with drag / paste / pick media. */
function CommentComposer({ source, users }: { source: CommentSource; users: Person[] }) {
  const create = useCreateComment(source);
  const [body, setBody] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const media = useMediaAttachments();

  function post() {
    const text = body.trim();
    if ((!text && media.items.length === 0) || media.busy) return;
    create.mutate(
      { body: text, mentions: mentionIds, images: media.urls },
      {
        onSuccess: () => {
          setBody('');
          setMentionIds([]);
          media.clear();
        },
      },
    );
  }

  return (
    <div
      className={cn(
        'mt-5 rounded-lg border bg-card p-2 shadow-sm transition-colors focus-within:border-primary',
        media.dragging && 'border-primary ring-2 ring-primary/30',
      )}
      {...media.dropHandlers}
    >
      <MentionTextarea
        value={body}
        onChange={setBody}
        onMentionsChange={setMentionIds}
        options={users.map((u) => ({ id: u.id, name: u.name }))}
        placeholder={t('activity.placeholder')}
        aria-label={t('activity.placeholder')}
        className="min-h-[60px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <AttachmentStrip items={media.items} busy={media.busy} onRemove={media.remove} className="mt-1" />
      <div className="mt-1 flex items-center justify-between gap-2 px-1 pb-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <AttachMediaButton onFiles={media.addFiles} disabled={media.busy} />
          <span className="truncate text-xs text-muted-foreground">
            {media.dragging ? t('activity.dropHint') : t('activity.mentionHint')}
          </span>
        </div>
        <Button
          size="sm"
          onClick={post}
          disabled={(!body.trim() && media.items.length === 0) || media.busy}
          loading={create.isPending}
        >
          {t('activity.comment')}
        </Button>
      </div>
    </div>
  );
}

/** One comment in the thread — avatar, inline edit / delete, and any media. */
function CommentItem({
  source,
  comment,
  canEdit,
}: {
  source: CommentSource;
  comment: CommentDto;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const update = useUpdateComment(source);
  const remove = useDeleteComment(source);
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;

  function saveEdit() {
    const body = draft.trim();
    if (!body || body === comment.body) {
      setEditing(false);
      return;
    }
    update.mutate({ commentId: comment.id, input: { body } }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="group flex gap-3">
      <Avatar name={comment.authorName} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2 text-sm">
          <span className="font-medium">{comment.authorName}</span>
          <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          {edited && <span className="text-xs text-muted-foreground">· {t('activity.edited')}</span>}
          {canEdit && !editing && (
            <span className="ml-auto flex gap-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => confirm(t('activity.confirmDelete')) && remove.mutate(comment.id)}
              >
                {t('common.delete')}
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={saveEdit} loading={update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
            <CommentMedia urls={comment.images} />
          </>
        )}
      </div>
    </div>
  );
}
