import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { EditableTitle, Menu, RichText, RichTextEditor, type MenuItem } from '@/components/ui';
import { AttachmentSection } from '@/components/AttachmentBar';
import { useHtmlSaveGuard } from '@/components/EditGuard';
import {
  DescriptionTemplates,
  useTemplateSeed,
  type DescriptionTemplate,
} from '@/components/DescriptionTemplates';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { usePageChrome } from '@/layouts/headers/PageChrome';
import { FavouriteKind, ReactionTargetType } from '@/types/enums';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { LinkedDocsSection } from '@/features/docs/components/LinkedDocsSection';
import { CodeLinksSection } from '@/features/integrations/components/CodeLinksSection';
import type { BugAttachment, CommentDto } from '@/types/dto';
import { type IssueSubject } from '@/features/activity/api';
import { ActivityHeader, CommentThread, type Person } from '@/features/activity/CommentThread';
import { Avatar } from '@/features/activity/Avatar';

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
  /** Files attached to the issue itself — the screenshots and specs that belong
   *  to the ticket rather than to one comment in its thread. */
  attachments?: BugAttachment[];
  /** The whole list after an add/remove; the issue saves it as one field. Omit
   *  on a read-only view (public share) — without it the section never offers a
   *  way in, even when `canWrite` is true. */
  onSaveAttachments?: (next: BugAttachment[]) => void;
  /** Starter structures offered above the description — a bug's repro-steps
   *  shapes (`bugs/bugTemplates`). Omit for issues that have none; the picker
   *  renders nothing rather than an empty strip. */
  templates?: DescriptionTemplate[];
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
  /** The Properties block, rendered inline under the title (the single-column
   * drawer layout) instead of in a right sidebar. Set only by the peek drawer;
   * the full-page detail leaves it off and keeps Properties in the sidebar. */
  propertiesInline?: ReactNode;
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
  attachments = [],
  onSaveAttachments,
  templates = [],
  menuItems,
  menuTarget = 'header',
  favourite,
  beforeActivity,
  propertiesInline,
}: IssueDetailMainProps) {
  // The description saves when you leave it, not while you type: `onChange`
  // fires for every DOM mutation the editor sees, and a browser page translator
  // rewriting the text is one of those. The guard also refuses to write a value
  // that drops most of what's stored without asking first (components/EditGuard).
  const guard = useHtmlSaveGuard({ saved: description, onSave: onSaveDescription });

  // Templates: applying one saves at once (no debounce) and remounts the editor
  // via `nonce`, since Editor.js only reads `value` at mount.
  const seed = useTemplateSeed(description, onSaveDescription, issueId);

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
      {/* `items-start`, not centre: a title now wraps to two lines, and the
          star and ⋯ belong beside its first line rather than halfway down it. */}
      <div className="flex items-start gap-2">
        {/* Reads as a heading and edits as a field — so a long title wraps
            instead of scrolling off its own right edge, and the browser's
            translator can reach it. See ui/EditableTitle. */}
        <EditableTitle
          value={title}
          onSave={onSaveTitle}
          placeholder={titlePlaceholder}
          canWrite={canWrite}
        />
        {/* Inbox pane (no topbar): favourite + ⋯ sit inline in the title row. */}
        {menuTarget === 'header' && favourite && currentUserId && (
          <FavouriteButton
            kind={favourite.kind}
            refId={favourite.refId}
            roadmapId={favourite.roadmapId}
            issueKind={subject}
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
            issueKind={subject}
            title={title}
            size={16}
            className="size-7"
          />,
          crumbActionsSlot,
        )}
      {menuTarget === 'topbar' && overflow && crumbActionsSlot && createPortal(overflow, crumbActionsSlot)}

      {/* Drawer (single-column) layout: Properties sit inline under the title, in a
          self-contained band, rather than in a right-hand sidebar. */}
      {propertiesInline && (
        <div className="mt-4 flex flex-col gap-5 border-y py-5">{propertiesInline}</div>
      )}

      <div className="mt-4">
        {canWrite ? (
          <>
            <DescriptionTemplates
              templates={templates}
              hasContent={seed.hasContent}
              onApply={seed.apply}
            />
            <RichTextEditor
              key={`${issueId}:${seed.nonce}:${guard.nonce}`}
              value={seed.value}
              onChange={guard.draft}
              onBlur={guard.commit}
              placeholder={descriptionPlaceholder}
              minHeight={80}
              images
              // `@` names a person in the description the same way it does in a
              // comment. The chip is a reference, not a ping — only comments notify.
              mentions
              className="border-0"
            />
            {guard.dialog}
          </>
        ) : description ? (
          <RichText className="text-sm text-muted-foreground" html={description} />
        ) : (
          <p className="text-sm text-muted-foreground">{descriptionPlaceholder}</p>
        )}
      </div>

      {/* Reactions — social-style quick reactions, directly under the description. */}
      {currentUserId && (
        <ReactionBar
          targetType={ReactionTargetType.ISSUE}
          targetId={issueId}
          className="mt-3"
        />
      )}

      {/* Files on the ticket itself — the screenshots, logs and specs that are
          evidence for the issue rather than part of one comment. Hidden entirely
          on a read-only view with nothing attached, so a public share doesn't
          grow an empty section. */}
      <AttachmentSection
        items={attachments}
        canWrite={canWrite && !!onSaveAttachments}
        onChange={onSaveAttachments}
        className="mt-8"
      />

      {/* Optional inset (task detail's Sub-tasks) between description and Activity. */}
      {beforeActivity}

      {/* Commits and pull requests that named this issue's ref. Lives here rather
          than in each page so task detail and bug detail get it identically.
          `comments` means the public read-only view, which has no token to read
          an authed endpoint with — passing no id keeps it from trying. */}
      <CodeLinksSection subjectId={comments ? undefined : issueId} className="mt-8" />

      {/* Doc pages written about this issue — the other end of a page's
          "Link Task or Doc". Renders nothing when there are none. */}
      <LinkedDocsSection refId={issueId} className="mt-8" />

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      <section className="mt-10 border-t pt-6">
        <ActivityHeader />

        <div className="flex flex-col gap-5">
          <CommentThread
            source={subject === 'bug' ? { kind: 'bug', id: issueId } : { kind: 'task', id: issueId }}
            users={users}
            canWrite={canWrite}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            comments={comments}
            // The issue's creation opens the change log, so it lives in the
            // Activity tab — not above both tabs, where it would sit on top of a
            // conversation it isn't part of. Rendered here rather than read from
            // the activity feed because a public viewer can't fetch that feed.
            activityLead={
              <div className="flex items-center gap-3 text-sm">
                <Avatar name={createdByName} />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {createdByName || t('tasks.someone')}
                  </span>{' '}
                  {createdLabel} · {timeAgo(createdAt)}
                </span>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
}

