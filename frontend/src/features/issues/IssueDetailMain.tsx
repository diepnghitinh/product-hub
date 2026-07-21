import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { Menu, RichTextEditor, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { usePageChrome } from '@/layouts/headers/PageChrome';
import { FavouriteKind, ReactionTargetType } from '@/types/enums';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import type { CommentDto } from '@/types/dto';
import { type IssueSubject } from '@/features/activity/api';
import { CommentThread, Avatar, type Person } from '@/features/activity/CommentThread';

export interface IssueDetailMainProps {
  /** Which thread the comments belong to — routes + cache keys differ. */
  subject: IssueSubject;
  /** Resolved uuid — keys the comment thread; the page's save callbacks use it. */
  issueId: string;
  /** Human reference (e.g. TSK-7 / BUG-12) shown above the title. */
  shortId?: string;
  title: string;
  titlePlaceholder: string;
  description: string;
  descriptionPlaceholder: string;
  /** Opening timeline event: "{createdByName} {createdLabel} · {when}". */
  createdByName: string;
  createdAt: string;
  createdLabel: string;
  canWrite: boolean;
  isAdmin: boolean;
  currentUserId?: string;
  /** People who can be @-mentioned in a comment. */
  users: Person[];
  /** When provided (a public read-only view), render these instead of fetching
   * the authed comment thread. */
  comments?: CommentDto[];
  onSaveTitle: (title: string) => void;
  onSaveDescription: (html: string) => void;
  /** Overflow (⋯) actions for the header — e.g. Delete. Hidden when empty. */
  menuItems?: MenuItem[];
  /** Where the ⋯ menu renders: portaled into the app topbar, right of the
   * breadcrumb ('topbar' — the standalone task/bug routes), or inline in the
   * title row ('header', default — the inbox pane, which has no topbar). */
  menuTarget?: 'header' | 'topbar';
  /** When set (and a user is signed in) show a ⭐ pin toggle in the header. */
  favourite?: { kind: FavouriteKind; refId: string; roadmapId?: string };
  /** Optional content rendered between the description and the Activity timeline
   * — e.g. the task detail's Sub-tasks panel. Bugs pass nothing. */
  beforeActivity?: ReactNode;
}

/**
 * The shared main column of an issue detail — a task or a bug. Renders the
 * short-id label, an editable title, a rich description, and the activity
 * timeline (creation event + comment thread + composer). Both TaskDetailPage and
 * BugDetail render this and add only their own Properties sidebar, so the two
 * pages read as one product.
 *
 * Mount one per issue (`key={issueId}` at the call site): the title input and
 * the rich editor seed from their initial value, so a new subject needs a fresh
 * subtree — this matters where the component is reused in place, e.g. the inbox.
 */
export function IssueDetailMain({
  subject,
  issueId,
  shortId,
  title,
  titlePlaceholder,
  description,
  descriptionPlaceholder,
  createdByName,
  createdAt,
  createdLabel,
  canWrite,
  isAdmin,
  currentUserId,
  users,
  comments,
  onSaveTitle,
  onSaveDescription,
  menuItems,
  menuTarget = 'header',
  favourite,
  beforeActivity,
}: IssueDetailMainProps) {
  // The rich editor emits HTML on every keystroke — debounce so we save once the
  // user pauses, not per character, and skip no-op round trips.
  const savedRef = useRef(description);
  savedRef.current = description;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  function handleDescription(html: string) {
    if (html === savedRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSaveDescription(html), 700);
  }

  // The ⋯ overflow menu. On a standalone route it portals up into the app
  // topbar (right of the breadcrumb); in the inbox pane it renders inline.
  const { crumbActions: crumbActionsSlot } = usePageChrome();
  const overflow =
    menuItems && menuItems.length > 0 ? (
      <Menu
        align="left"
        triggerClassName="size-9 shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-transparent hover:text-muted-foreground"
        trigger={
          <>
            <span className="relative flex h-9 w-9 items-center justify-center">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-sm',
                  'hover:bg-accent/60 hover:text-accent-foreground'
                )}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </span>
            </span>
            <span className="sr-only">{t('common.more')}</span>
          </>
        }
        items={menuItems}
      />
    ) : null;

  return (
    <div className="min-w-0">
      {shortId && (
        <span className="mb-1 block font-mono text-xs text-muted-foreground">{shortId}</span>
      )}
      {/* Title row — the ⋯ overflow menu (Delete, …) sits at its right, like an
          issue header. Hidden when there are no actions the viewer may take. */}
      <div className="flex items-center gap-2">
        {canWrite ? (
          <input
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
            defaultValue={title}
            placeholder={titlePlaceholder}
            aria-label={titlePlaceholder}
            onBlur={(e) =>
              e.target.value.trim() && e.target.value !== title && onSaveTitle(e.target.value.trim())
            }
          />
        ) : (
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{title}</h1>
        )}
        {/* Inbox pane (no topbar): favourite + ⋯ sit inline in the title row. */}
        {menuTarget === 'header' && favourite && currentUserId && (
          <FavouriteButton
            kind={favourite.kind}
            refId={favourite.refId}
            roadmapId={favourite.roadmapId}
            title={title}
          />
        )}
        {menuTarget === 'header' && overflow}
      </div>

      {/* Standalone routes: lift the favourite star + the ⋯ menu up beside the
          breadcrumb (the crumbActions slot), so they sit together after the crumb. */}
      {menuTarget === 'topbar' &&
        favourite &&
        currentUserId &&
        crumbActionsSlot &&
        createPortal(
          <FavouriteButton
            kind={favourite.kind}
            refId={favourite.refId}
            roadmapId={favourite.roadmapId}
            title={title}
            size={16}
            className="size-7"
          />,
          crumbActionsSlot,
        )}
      {menuTarget === 'topbar' && overflow && crumbActionsSlot && createPortal(overflow, crumbActionsSlot)}

      <div className="mt-4">
        {canWrite ? (
          <RichTextEditor
            value={description}
            onChange={handleDescription}
            placeholder={descriptionPlaceholder}
            minHeight={80}
            images
            className="border-0"
          />
        ) : description ? (
          <div
            className="text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{descriptionPlaceholder}</p>
        )}
      </div>

      {/* Reactions — social-style quick reactions, directly under the description. */}
      {currentUserId && (
        <ReactionBar
          targetType={subject === 'bug' ? ReactionTargetType.BUG : ReactionTargetType.TASK}
          targetId={issueId}
          className="mt-3"
        />
      )}

      {/* Optional inset (task detail's Sub-tasks) between description and Activity. */}
      {beforeActivity}

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      <section className="mt-10 border-t pt-6">
        <h2 className="mb-5 text-base font-semibold">{t('activity.title')}</h2>

        <div className="flex flex-col gap-5">
          {/* System event — the issue's creation opens the timeline. */}
          <div className="flex items-center gap-3 text-sm">
            <Avatar name={createdByName} />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {createdByName || t('tasks.someone')}
              </span>{' '}
              {createdLabel} · {timeAgo(createdAt)}
            </span>
          </div>

          <CommentThread
            source={subject === 'bug' ? { kind: 'bug', id: issueId } : { kind: 'task', id: issueId }}
            users={users}
            canWrite={canWrite}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            comments={comments}
          />
        </div>
      </section>
    </div>
  );
}

