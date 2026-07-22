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
      items.push({
        kind: InboxKind.MENTION,
        id: c.id.toString(),
        refId: c.bugId,
        key: `${InboxKind.MENTION}:${c.id.toString()}:${c.createdAt.getTime()}`,
        title: c.body.length > 100 ? `${c.body.slice(0, 100)}…` : c.body,
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
