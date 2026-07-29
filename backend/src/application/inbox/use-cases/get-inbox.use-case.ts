import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { InboxKind } from '../domain/inbox-kind.enum';

export interface InboxItem {
  kind: InboxKind;
  id: string;
  refId: string;
  /**
   * Stable per-notification key for read tracking: `kind:id:occurrence`. The
   * occurrence is the item's timestamp, so an assigned bug that's updated again
   * becomes a *new* key — i.e. it re-surfaces as unread — while a one-off mention
   * keeps the same key forever.
   */
  key: string;
  title: string;
  actorName: string;
  seen: boolean;
  createdAt: Date;
}

export interface InboxResult {
  items: InboxItem[];
  unseenCount: number;
  /** Legacy field, always null now that read state is per-item. */
  seenAt: Date | null;
}

export interface GetInboxRequest {
  tenantId: string;
  userId: string;
}

/**
 * A comment body is rich HTML — a mention is a `<span class="rte-mention">`, not
 * bare text. The inbox shows one flat line per notification, so flatten it here:
 * the list renders its title as text, and unflattened markup would show up as
 * literal tags.
 */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    // `&amp;` last, or `&amp;lt;` would decode all the way down to `<`.
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Assembles a user's inbox from two sources — comments that mention them and
 * bugs assigned to them — annotating each with its own read state from
 * `user.readInboxKeys` (per-item, not an all-or-nothing watermark).
 */
@Injectable()
export class GetInboxUseCase implements IUsecaseExecute<GetInboxRequest, Result<InboxResult>> {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    // Assigned section reads bugs from the unified issues store (kind-filtered below).
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
  ) {}

  async execute({ tenantId, userId }: GetInboxRequest): Promise<Result<InboxResult>> {
    const user = await this.users.findById(userId);

    const [mentions, assigned] = await Promise.all([
      this.comments.findMentionsForUser(tenantId, userId, 50),
      this.issues.findByTenant(
        tenantId,
        // The inbox's "assigned" section is bugs only — filter kind so assigned
        // tasks don't leak in. assigneeId is multi-value (string[]) — wrap the id.
        Object.assign(new QueryIssueDto(), {
          kind: [IssueKind.BUG],
          assigneeId: [userId],
          page: 1,
          limit: 50,
        }),
      ),
    ]);

    const items: InboxItem[] = [];

    for (const c of mentions) {
      if (c.authorId === userId) continue; // don't notify yourself
      // A doc mention points at the page, with the thread to open — the inbox
      // navigates there rather than rendering a whole doc page in its list pane.
      const isDoc = !!c.docPageId;
      const kind = isDoc ? InboxKind.DOC_MENTION : InboxKind.MENTION;
      const text = plainText(c.body);
      items.push({
        kind,
        id: c.id.toString(),
        refId: isDoc ? `${c.docId}/${c.docPageId}?comment=${c.id.toString()}` : c.bugId,
        key: `${kind}:${c.id.toString()}:${c.createdAt.getTime()}`,
        title: text.length > 100 ? `${text.slice(0, 100)}…` : text,
        actorName: c.authorName,
        seen: false,
        createdAt: c.createdAt,
      });
    }

    for (const b of assigned.data) {
      items.push({
        kind: InboxKind.ASSIGNED_BUG,
        id: b.id.toString(),
        refId: b.id.toString(),
        key: `${InboxKind.ASSIGNED_BUG}:${b.id.toString()}:${b.updatedAt.getTime()}`,
        title: b.title,
        actorName: b.reporterName,
        seen: false,
        createdAt: b.updatedAt,
      });
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let unseenCount = 0;
    for (const item of items) {
      item.seen = user ? user.isInboxItemRead(item.key) : false;
      if (!item.seen) unseenCount += 1;
    }

    return Result.ok({ items, unseenCount, seenAt: null });
  }
}
