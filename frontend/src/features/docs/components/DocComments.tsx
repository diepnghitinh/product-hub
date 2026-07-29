import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CornerDownRight, MessageSquare, RotateCcw, X } from 'lucide-react';
import { Badge, Button, RichText, RichTextEditor, Spinner } from '@/components/ui';
import { Avatar, toEditorValue } from '@/features/activity/CommentThread';
import { htmlToPlainText, isRichHtml, mentionIdsFromHtml } from '@/lib/editorjs';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import type { TextAnchor } from '@/lib/textAnchor';
import type { CommentDto } from '@/types/dto';
import {
  useCreateDocComment,
  useDeleteDocComment,
  useResolveDocComment,
  useUpdateDocComment,
} from '../api';

export interface DocCommentsProps {
  docId: string;
  pageId: string;
  comments: CommentDto[];
  /** Each thread's vertical position on the page, so the list reads in page order. */
  tops: Record<string, number>;
  /** Threads whose quoted passage is no longer in the page. */
  orphaned: string[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  /** A passage selected but not yet commented on. */
  pending: TextAnchor | null;
  onCancelPending: () => void;
  /** Rendered as a panel inside the page on desktop; the drawer supplies its own
   *  close affordance on mobile, so the header's is optional. */
  onClose?: () => void;
}

type Filter = 'open' | 'resolved';

/**
 * The comments rail: every thread on this page, read in the order the passages
 * appear rather than the order they were written — a note on the first paragraph
 * belongs at the top even if it was added last.
 *
 * A thread whose quote has since been edited away is *orphaned*, not deleted and
 * not silently re-pointed: it keeps its place at the end of the list with the
 * passage it used to be about, struck through. Losing the text is not the same
 * as resolving the conversation.
 */
export function DocComments({
  docId,
  pageId,
  comments,
  tops,
  orphaned,
  activeId,
  onActivate,
  pending,
  onCancelPending,
  onClose,
}: DocCommentsProps) {
  const [filter, setFilter] = useState<Filter>('open');
  const orphanSet = useMemo(() => new Set(orphaned), [orphaned]);

  // Fold the flat list into one-level threads, the same shape the issue timeline
  // uses: a reply whose root has gone starts a thread of its own rather than
  // vanishing with it.
  const { roots, repliesByRoot } = useMemo(() => {
    const rootIds = new Set(comments.filter((c) => !c.parentId).map((c) => c.id));
    const byRoot = new Map<string, CommentDto[]>();
    const list: CommentDto[] = [];
    for (const c of comments) {
      if (!c.parentId || !rootIds.has(c.parentId)) list.push(c);
      else {
        const existing = byRoot.get(c.parentId);
        if (existing) existing.push(c);
        else byRoot.set(c.parentId, [c]);
      }
    }
    return { roots: list, repliesByRoot: byRoot };
  }, [comments]);

  const openCount = roots.filter((c) => !c.resolved).length;
  const resolvedCount = roots.length - openCount;

  const shown = useMemo(() => {
    const wanted = roots.filter((c) => (filter === 'open' ? !c.resolved : c.resolved));
    return wanted.sort((a, b) => {
      // Unanchored notes and orphans have no place on the page — they sit after
      // everything that does, oldest first.
      const at = tops[a.id] ?? Number.POSITIVE_INFINITY;
      const bt = tops[b.id] ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [roots, filter, tops]);

  // Answering a thread that's been ticked off means looking at the resolved
  // list, so following a link to one has to switch the filter with it.
  useEffect(() => {
    if (!activeId) return;
    const target = roots.find((c) => c.id === activeId);
    if (target) setFilter(target.resolved ? 'resolved' : 'open');
  }, [activeId, roots]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="mr-auto text-sm font-semibold">{t('docs.comments.title')}</h2>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b px-3 py-2">
        {(['open', 'resolved'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {key === 'open' ? t('docs.comments.open') : t('docs.comments.resolved')}
            <span className="tabular-nums opacity-70">
              {key === 'open' ? openCount : resolvedCount}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {pending && (
          <PendingComposer
            docId={docId}
            pageId={pageId}
            anchor={pending}
            onCancel={onCancelPending}
          />
        )}

        {shown.length === 0 && !pending ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            {filter === 'open' ? t('docs.comments.empty') : t('docs.comments.emptyResolved')}
          </p>
        ) : (
          shown.map((root) => (
            <ThreadCard
              key={root.id}
              docId={docId}
              pageId={pageId}
              root={root}
              replies={repliesByRoot.get(root.id) ?? []}
              orphaned={!!root.anchorExact && orphanSet.has(root.id)}
              active={activeId === root.id}
              onActivate={() => onActivate(root.id)}
            />
          ))
        )}
      </div>

      {/* A note about the page as a whole — the panel is otherwise dead until
          something is selected, and not every remark is about one sentence. */}
      <PageComposer docId={docId} pageId={pageId} />
    </div>
  );
}

/** The passage a thread is about, as the rail shows it. */
function Quote({ text, orphaned }: { text: string; orphaned: boolean }) {
  return (
    <p
      className={cn(
        'mb-2 line-clamp-3 border-l-2 pl-2 text-xs italic',
        orphaned
          ? 'border-muted-foreground/30 text-muted-foreground/70 line-through'
          : 'border-primary/60 text-muted-foreground',
      )}
      title={text}
    >
      {text}
    </p>
  );
}

function ThreadCard({
  docId,
  pageId,
  root,
  replies,
  orphaned,
  active,
  onActivate,
}: {
  docId: string;
  pageId: string;
  root: CommentDto;
  replies: CommentDto[];
  orphaned: boolean;
  active: boolean;
  onActivate: () => void;
}) {
  const resolve = useResolveDocComment(docId, pageId);
  const ref = useRef<HTMLElement>(null);

  // Arriving from a mention link, the thread may be well down a long list.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <article
      ref={ref}
      onClick={onActivate}
      className={cn(
        'cursor-default rounded-lg border bg-card p-3 shadow-sm transition-colors',
        active ? 'border-primary/60 ring-1 ring-primary/20' : 'hover:border-primary/30',
        root.resolved && 'opacity-70',
      )}
    >
      {root.anchorExact ? (
        <Quote text={root.anchorExact} orphaned={orphaned} />
      ) : (
        <Badge variant="muted" className="mb-2">
          {t('docs.comments.wholePage')}
        </Badge>
      )}
      {orphaned && (
        <p className="mb-2 text-[11px] text-muted-foreground">{t('docs.comments.orphaned')}</p>
      )}

      <CommentRow docId={docId} pageId={pageId} comment={root} />
      {replies.map((r) => (
        <CommentRow key={r.id} docId={docId} pageId={pageId} comment={r} isReply />
      ))}

      <div className="mt-2 flex items-center gap-2">
        <ReplyBox docId={docId} pageId={pageId} parentId={root.id} />
        <button
          type="button"
          onClick={() => resolve.mutate({ commentId: root.id, resolved: !root.resolved })}
          disabled={resolve.isPending}
          className={cn(
            'ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
            root.resolved
              ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
              : 'text-success hover:bg-success/10',
          )}
        >
          {resolve.isPending ? (
            <Spinner className="size-3.5" />
          ) : root.resolved ? (
            <RotateCcw className="size-3.5" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          {root.resolved ? t('docs.comments.reopen') : t('docs.comments.resolve')}
        </button>
      </div>

      {root.resolved && root.resolvedByName && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t('docs.comments.resolvedBy').replace('{name}', root.resolvedByName)}
        </p>
      )}
    </article>
  );
}

/** One comment in a thread — the root, or a reply indented beneath it. */
function CommentRow({
  docId,
  pageId,
  comment,
  isReply,
}: {
  docId: string;
  pageId: string;
  comment: CommentDto;
  isReply?: boolean;
}) {
  const { user, isAdmin } = useAuth();
  const update = useUpdateDocComment(docId, pageId);
  const remove = useDeleteDocComment(docId, pageId);
  const editorValue = toEditorValue(comment.body);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editorValue);
  const canEdit = !!user && (comment.authorId === user.id || isAdmin);
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;

  function save() {
    const body = draft.trim();
    if (!htmlToPlainText(body).trim() || body === editorValue.trim()) {
      setEditing(false);
      return;
    }
    update.mutate(
      { commentId: comment.id, input: { body, mentions: mentionIdsFromHtml(body) } },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className={cn('group', isReply && 'mt-2.5 border-t pt-2.5 pl-3')}>
      <div className="mb-1 flex items-center gap-2">
        {isReply && (
          <CornerDownRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Avatar name={comment.authorName} className="size-5 text-[9px]" />
        <span className="truncate text-xs font-semibold">{comment.authorName}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {timeAgo(comment.createdAt)}
          {edited && ` (${t('activity.edited')})`}
        </span>
        {canEdit && !editing && (
          <span className="ml-auto flex shrink-0 gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setDraft(editorValue);
                setEditing(true);
              }}
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => confirm(t('activity.confirmDelete')) && remove.mutate(comment.id)}
            >
              {t('common.delete')}
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border bg-background px-2.5 py-2 transition-colors focus-within:border-primary">
            <RichTextEditor
              value={editorValue}
              onChange={setDraft}
              minHeight={36}
              minimal
              mentions
              autoFocus
              className="rte-bare"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={save} loading={update.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : isRichHtml(comment.body) ? (
        <RichText className="text-[13px] text-foreground" html={comment.body} />
      ) : (
        <p className="whitespace-pre-wrap text-[13px] text-foreground">{comment.body}</p>
      )}
    </div>
  );
}

/**
 * The box that turns a selected passage into a thread. Mounted only while a
 * selection is pending, so it always opens focused and empty.
 */
function PendingComposer({
  docId,
  pageId,
  anchor,
  onCancel,
}: {
  docId: string;
  pageId: string;
  anchor: TextAnchor;
  onCancel: () => void;
}) {
  const create = useCreateDocComment(docId, pageId);
  const [body, setBody] = useState('');
  const canPost = !!htmlToPlainText(body).trim();

  function post() {
    if (!canPost) return;
    create.mutate(
      {
        body: body.trim(),
        mentions: mentionIdsFromHtml(body),
        anchorExact: anchor.exact,
        anchorPrefix: anchor.prefix,
        anchorSuffix: anchor.suffix,
        anchorStart: anchor.start,
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <article className="rounded-lg border border-primary/60 bg-card p-3 shadow-sm ring-1 ring-primary/20">
      <Quote text={anchor.exact} orphaned={false} />
      <div className="rounded-lg border bg-background px-2.5 py-2 transition-colors focus-within:border-primary">
        <RichTextEditor
          value=""
          onChange={setBody}
          placeholder={t('docs.comments.placeholder')}
          minHeight={36}
          minimal
          mentions
          autoFocus
          className="rte-bare"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={post} disabled={!canPost} loading={create.isPending}>
          {t('docs.comments.post')}
        </Button>
      </div>
    </article>
  );
}

/** "Leave a reply" under a thread — one line until it's clicked. */
function ReplyBox({
  docId,
  pageId,
  parentId,
}: {
  docId: string;
  pageId: string;
  parentId: string;
}) {
  const create = useCreateDocComment(docId, pageId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  // Editor.js owns its content after mount, so emptying the box is a remount.
  const [nonce, setNonce] = useState(0);
  const canPost = !!htmlToPlainText(body).trim();

  function post() {
    if (!canPost) return;
    create.mutate(
      { body: body.trim(), mentions: mentionIdsFromHtml(body), parentId },
      {
        onSuccess: () => {
          setBody('');
          setNonce((n) => n + 1);
          setOpen(false);
        },
      },
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {t('activity.replyAction')}
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-lg border bg-background px-2.5 py-2 transition-colors focus-within:border-primary">
        <RichTextEditor
          key={nonce}
          value=""
          onChange={setBody}
          placeholder={t('activity.reply')}
          minHeight={0}
          minimal
          mentions
          autoFocus
          className="rte-bare"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={post} disabled={!canPost} loading={create.isPending}>
          {t('activity.replyAction')}
        </Button>
      </div>
    </div>
  );
}

/** A remark about the page rather than a passage — no anchor, sorted last. */
function PageComposer({ docId, pageId }: { docId: string; pageId: string }) {
  const create = useCreateDocComment(docId, pageId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [nonce, setNonce] = useState(0);
  const canPost = !!htmlToPlainText(body).trim();

  function post() {
    if (!canPost) return;
    create.mutate(
      { body: body.trim(), mentions: mentionIdsFromHtml(body) },
      {
        onSuccess: () => {
          setBody('');
          setNonce((n) => n + 1);
          setOpen(false);
        },
      },
    );
  }

  return (
    <div className="border-t p-3">
      {open ? (
        <>
          <div className="rounded-lg border bg-background px-2.5 py-2 transition-colors focus-within:border-primary">
            <RichTextEditor
              key={nonce}
              value=""
              onChange={setBody}
              placeholder={t('docs.comments.pagePlaceholder')}
              minHeight={36}
              minimal
              mentions
              autoFocus
              className="rte-bare"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={post} disabled={!canPost} loading={create.isPending}>
              {t('docs.comments.post')}
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <MessageSquare className="size-3.5" /> {t('docs.comments.pageComment')}
        </Button>
      )}
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">{t('docs.comments.hint')}</p>
    </div>
  );
}
