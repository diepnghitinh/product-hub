import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button, MentionTextarea, Spinner, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth';
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

/** "Activity" section title + the signed-in viewer's own avatar. */
export function ActivityHeader() {
  const { user } = useAuth();
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="text-xl font-bold tracking-tight">{t('activity.title')}</h2>
      {user && <Avatar name={user.name} className="size-7" />}
    </div>
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

  // Fold the flat list into one-level threads: each top-level comment plus the
  // replies pointing at it. A reply whose parent isn't a known top-level comment
  // (e.g. the parent was deleted) starts its own thread, so a reply is never
  // dropped. `thread` is already sorted oldest-first, so both stay chronological.
  const rootIds = new Set(thread.filter((c) => !c.parentId).map((c) => c.id));
  const repliesByRoot = new Map<string, CommentDto[]>();
  const roots: CommentDto[] = [];
  for (const c of thread) {
    if (!c.parentId || !rootIds.has(c.parentId)) {
      roots.push(c);
    } else {
      const list = repliesByRoot.get(c.parentId);
      if (list) list.push(c);
      else repliesByRoot.set(c.parentId, [c]);
    }
  }

  return (
    <>
      {roots.map((root) => (
        <CommentThreadCard
          key={root.id}
          source={source}
          root={root}
          replies={repliesByRoot.get(root.id) ?? []}
          users={users}
          canWrite={canWrite}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      ))}

      {canWrite && <CommentComposer source={source} users={users} variant="root" />}
    </>
  );
}

/**
 * One thread: a top-level comment with its replies indented beneath it, rendered
 * open (no card) so the comments read as part of the timeline, followed by a
 * boxed "Leave a reply" composer. Only the composer is a bordered box — the
 * comments themselves are not — matching the reference Activity layout.
 */
function CommentThreadCard({
  source,
  root,
  replies,
  users,
  canWrite,
  isAdmin,
  currentUserId,
}: {
  source: CommentSource;
  root: CommentDto;
  replies: CommentDto[];
  users: Person[];
  canWrite: boolean;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const canEdit = (c: CommentDto) => canWrite && (c.authorId === currentUserId || isAdmin);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <CommentItem source={source} comment={root} canEdit={canEdit(root)} />
        {replies.map((r) => (
          <CommentItem key={r.id} source={source} comment={r} canEdit={canEdit(r)} isReply />
        ))}
      </div>
      {canWrite && (
        <CommentComposer source={source} users={users} variant="reply" parentId={root.id} />
      )}
    </div>
  );
}

/**
 * The comment box: viewer's avatar, @-mention textarea, drag / paste / pick media.
 * `root` is the standalone composer at the foot of the thread (posts a new
 * top-level comment); `reply` is the compact single-row composer that sits under a
 * thread's comments and posts a reply to that thread's `parentId`. Both are their
 * own bordered box; the comments they attach to are not.
 */
function CommentComposer({
  source,
  users,
  variant = 'root',
  parentId,
}: {
  source: CommentSource;
  users: Person[];
  variant?: 'root' | 'reply';
  parentId?: string;
}) {
  const { user } = useAuth();
  const create = useCreateComment(source);
  const [body, setBody] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const media = useMediaAttachments();
  const isReply = variant === 'reply';

  const canPost = (!!body.trim() || media.items.length > 0) && !media.busy;

  function post() {
    if (!canPost) return;
    create.mutate(
      { body: body.trim(), mentions: mentionIds, images: media.urls, ...(parentId ? { parentId } : {}) },
      {
        onSuccess: () => {
          setBody('');
          setMentionIds([]);
          media.clear();
        },
      },
    );
  }

  const textarea = (
    <MentionTextarea
      value={body}
      onChange={setBody}
      onMentionsChange={setMentionIds}
      options={users.map((u) => ({ id: u.id, name: u.name }))}
      placeholder={isReply ? t('activity.reply') : t('activity.placeholder')}
      aria-label={isReply ? t('activity.reply') : t('activity.placeholder')}
      // A reply starts as a single line so the field is one row (24px) and sits
      // centered against the avatar; the root composer stays multi-line.
      rows={isReply ? 1 : undefined}
      className={cn(
        'resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0',
        isReply ? 'min-h-[24px]' : 'min-h-[64px]',
      )}
    />
  );
  const attachBtn = <AttachMediaButton onFiles={media.addFiles} disabled={media.busy} />;
  const sendBtn = (
    <button
      type="button"
      aria-label={isReply ? t('activity.replyAction') : t('activity.comment')}
      title={isReply ? t('activity.replyAction') : t('activity.comment')}
      disabled={!canPost || create.isPending}
      onClick={post}
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {create.isPending ? <Spinner className="size-4" /> : <ArrowUp className="size-4" />}
    </button>
  );

  // Reply: a compact single-row bordered box under a thread's comments —
  // avatar · field · attach · send, with attachments dropping to a strip under the field.
  if (isReply) {
    return (
      <div
        className={cn(
          'rounded-xl border bg-card transition-colors focus-within:border-primary',
          media.dragging && 'border-primary ring-2 ring-primary/30',
        )}
        {...media.dropHandlers}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          {user && <Avatar name={user.name} />}
          <div className="min-w-0 flex-1">{textarea}</div>
          {attachBtn}
          {sendBtn}
        </div>
        <AttachmentStrip
          items={media.items}
          busy={media.busy}
          onRemove={media.remove}
          className="pb-2.5 pl-[3.25rem] pr-4"
        />
      </div>
    );
  }

  // Root: the standalone composer at the foot of the thread — a taller, avatar-less
  // box with the actions pinned to the bottom-right.
  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors focus-within:border-primary',
        media.dragging && 'border-primary ring-2 ring-primary/30',
      )}
      {...media.dropHandlers}
    >
      {textarea}
      <AttachmentStrip items={media.items} busy={media.busy} onRemove={media.remove} className="mt-2" />
      <div className="mt-1 flex items-center justify-end gap-1">
        {media.dragging && (
          <span className="mr-auto truncate text-xs text-muted-foreground">{t('activity.dropHint')}</span>
        )}
        {attachBtn}
        {sendBtn}
      </div>
    </div>
  );
}

/**
 * One comment inside a thread card — avatar, inline edit / delete, and any media.
 * The surrounding card owns the border; a reply gets a top divider and is
 * indented under its parent.
 */
function CommentItem({
  source,
  comment,
  canEdit,
  isReply,
}: {
  source: CommentSource;
  comment: CommentDto;
  canEdit: boolean;
  isReply?: boolean;
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
    <div className={cn('group', isReply && 'mt-3 border-t pt-3')}>
      <div className="mb-1.5 flex items-center gap-3">
        <Avatar name={comment.authorName} />
        <span className="text-sm font-semibold">{comment.authorName}</span>
        <span className="text-sm text-muted-foreground">
          {timeAgo(comment.createdAt)}
          {edited && ` (${t('activity.edited')})`}
        </span>
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
      {/* A reply's body is indented to sit under the author name (the avatar and
          header stay aligned with the parent), giving the nested-reply read. */}
      <div className={cn(isReply && 'pl-9')}>
        {editing ? (
          <div className="flex flex-col gap-2">
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
            <p className="whitespace-pre-wrap text-base text-foreground">{comment.body}</p>
            <CommentMedia urls={comment.images} />
          </>
        )}
      </div>
    </div>
  );
}
