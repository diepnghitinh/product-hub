import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IClickUpSync } from '@application/integrations/clickup-sync.port';
import { IssueEntity } from '../domain/entities/issue.entity';
import { IIssueRepository } from '../repositories/issue.repository';

export interface SetIssueStatusRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only movable by its owner or an admin. */
  requesterId: string;
  isAdmin: boolean;
  status: string;
  /** The card it was dropped onto — it lands directly above that one. Absent
   *  means the end of the column. */
  beforeId?: string;
}

/** Move an issue to another status column (Kanban drag), and to a chosen slot
 *  within it. */
@Injectable()
export class SetIssueStatusUseCase
  implements IUsecaseExecute<SetIssueStatusRequest, Result<IssueEntity>>
{
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IClickUpSync) private readonly clickup: IClickUpSync,
  ) {}

  async execute({ id, tenantId, requesterId, isAdmin, status, beforeId }: SetIssueStatusRequest): Promise<Result<IssueEntity>> {
    const issue = await this.issues.findById(id);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');
    // A personal task can only be moved by its owner (or an admin).
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');
    issue.setStatus(status);
    await this.issues.update(issue);
    await this.placeInColumn(issue, beforeId);
    // The outbound half of the two-way status rule: a drag here moves the card in
    // a bound ClickUp list. Best-effort by contract — it never throws, so ClickUp
    // being down can't stop someone moving a card on their own board.
    await this.clickup.issueChanged(issue);
    return Result.ok(issue);
  }

  /**
   * Put the issue at its new slot and renumber the column densely (0, 1, 2 …).
   *
   * Renumbering the whole column rather than nudging one row is what makes this
   * safe to turn on over existing data: every issue written before manual order
   * existed has `order: 0`, so the column is one big tie broken by `createdAt`.
   * The first drag reads that tie in the order the board was already showing and
   * writes it down, so the cards that *weren't* dragged stay exactly where they
   * were. Columns hold tens of cards, so this is one small bulk write.
   */
  private async placeInColumn(issue: IssueEntity, beforeId?: string): Promise<void> {
    const self = issue.id.toString();
    const peers = (await this.issues.columnPeerIds(issue)).filter((pid) => pid !== self);
    // An unknown `beforeId` (a card filtered off the board, or one just moved
    // away) means "no slot given" — append, never silently drop the card.
    const at = beforeId ? peers.indexOf(beforeId) : -1;
    peers.splice(at < 0 ? peers.length : at, 0, self);
    await this.issues.setOrders(peers.map((pid, i) => ({ id: pid, order: i })));
    // Keep the returned entity honest: the caller maps it straight to the
    // response, and a stale `order` would fight the client's optimistic list.
    issue.setOrder(peers.indexOf(self));
  }
}
