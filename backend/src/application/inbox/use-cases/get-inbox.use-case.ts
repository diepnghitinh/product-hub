import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { QueryBugDto } from '@application/bugs/dtos/query-bug.dto';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { InboxKind } from '../domain/inbox-kind.enum';

export interface InboxItem {
  kind: InboxKind;
  id: string;
  refId: string;
  title: string;
  actorName: string;
  seen: boolean;
  createdAt: Date;
}

export interface InboxResult {
  items: InboxItem[];
  unseenCount: number;
  seenAt: Date | null;
}

export interface GetInboxRequest {
  tenantId: string;
  userId: string;
}

/**
 * Assembles a user's inbox from two sources — comments that mention them and
 * bugs assigned to them — annotated as seen/unseen against `user.inboxSeenAt`.
 */
@Injectable()
export class GetInboxUseCase implements IUsecaseExecute<GetInboxRequest, Result<InboxResult>> {
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
  ) {}

  async execute({ tenantId, userId }: GetInboxRequest): Promise<Result<InboxResult>> {
    const user = await this.users.findById(userId);
    const seenAt = user?.inboxSeenAt ?? null;

    const [mentions, assigned] = await Promise.all([
      this.comments.findMentionsForUser(tenantId, userId, 50),
      this.bugs.findByTenant(
        tenantId,
        Object.assign(new QueryBugDto(), { assigneeId: userId, page: 1, limit: 50 }),
      ),
    ]);

    const items: InboxItem[] = [];

    for (const c of mentions) {
      if (c.authorId === userId) continue; // don't notify yourself
      items.push({
        kind: InboxKind.MENTION,
        id: c.id.toString(),
        refId: c.bugId,
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
        title: b.title,
        actorName: b.reporterName,
        seen: false,
        createdAt: b.updatedAt,
      });
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let unseenCount = 0;
    for (const item of items) {
      item.seen = seenAt ? item.createdAt.getTime() <= seenAt.getTime() : false;
      if (!item.seen) unseenCount += 1;
    }

    return Result.ok({ items, unseenCount, seenAt });
  }
}
