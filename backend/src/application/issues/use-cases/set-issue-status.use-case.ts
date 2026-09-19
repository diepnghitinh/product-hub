import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { RecordActivityUseCase } from '@application/audit-log/use-cases';
import { AuditActor, AuditEntity } from '@application/audit-log/domain/enums/audit.enums';
import { IssueEntity } from '../domain/entities/issue.entity';
import { autoStatusFor } from '../domain/issue-progress';
import { IIssueRepository } from '../repositories/issue.repository';

export interface SetIssueStatusRequest {
  id: string;
  tenantId: string;
  /** The caller — a personal task is only movable by its owner or an admin. */
  requesterId: string;
  /** Display name of the caller — recorded on history rows. */
  requesterName: string;
  /** Defaults to USER. MCP passes API so a bot is distinguishable from a person. */
  actorType?: AuditActor;
  isAdmin: boolean;
  status: string;
}

/**
 * How far up a chain one move is allowed to cascade.
 *
 * Nesting is a bare `parentId` with no cycle guard, so a chain that loops (a
 * botched re-parent, a direct DB edit) would otherwise walk forever inside a
 * request. Real nesting is one or two deep; five is a ceiling nobody reaches and
 * a loop hits immediately.
 */
const MAX_PARENT_DEPTH = 5;

/** Move an issue to another status column (Kanban drag). */
@Injectable()
export class SetIssueStatusUseCase
  implements IUsecaseExecute<SetIssueStatusRequest, Result<IssueEntity>>
{
  constructor(
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    private readonly activity: RecordActivityUseCase,
  ) {}

  async execute({
    id,
    tenantId,
    requesterId,
    requesterName,
    actorType,
    isAdmin,
    status,
  }: SetIssueStatusRequest): Promise<Result<IssueEntity>> {
    const issue = await this.issues.findById(id);
    if (!issue || issue.tenantId !== tenantId) return Result.fail('Issue not found');
    // A personal task can only be moved by its owner (or an admin).
    if (!issue.isVisibleTo(requesterId, isAdmin)) return Result.fail('Issue not found');
    const oldStatus = issue.status;
    issue.setStatus(status);
    await this.issues.update(issue);

    await this.activity.execute({
      tenantId,
      entity: AuditEntity.ISSUE,
      entityId: issue.id.toString(),
      entityRef: issue.shortId || issue.id.toString(),
      actor: { type: actorType ?? AuditActor.USER, id: requesterId, name: requesterName },
      changes:
        oldStatus === status
          ? []
          : [{ field: 'status', oldValue: oldStatus, newValue: status }],
    });

    if (oldStatus !== status) {
      await this.rollUpToParents(issue, { tenantId, requesterId, requesterName, actorType });
    }

    return Result.ok(issue);
  }

  /**
   * Carry a child's move up the chain: once every sub-task is done the parent is
   * moved to Done on its own, and if one is reopened the parent comes back out
   * of Done. Nobody should have to drag a card whose own sub-tasks already
   * answered the question.
   *
   * Only ever runs off a real status change, and only ever moves a parent
   * *between the two built-in* keys `autoStatusFor` can name — a parent parked in
   * a team's custom column is left alone on the way to Done, and is only pulled
   * out of Done, never into some column the team means something specific by.
   *
   * Failing here must not fail the move the user actually asked for: the child
   * is already saved and acknowledged, so a broken chain above it is logged by
   * the caller's error handling, not surfaced as "your drag didn't work". Hence
   * the guard rails — a depth cap (see {@link MAX_PARENT_DEPTH}) and a visited
   * set — rather than a transaction.
   */
  private async rollUpToParents(
    child: IssueEntity,
    ctx: {
      tenantId: string;
      requesterId: string;
      requesterName: string;
      actorType?: AuditActor;
    },
  ): Promise<void> {
    const seen = new Set<string>([child.id.toString()]);
    let parentId = child.parentId;

    for (let depth = 0; depth < MAX_PARENT_DEPTH && parentId; depth += 1) {
      if (seen.has(parentId)) return;
      seen.add(parentId);

      const parent = await this.issues.findById(parentId);
      if (!parent || parent.tenantId !== ctx.tenantId) return;

      const rollups = await this.issues.childRollups(ctx.tenantId, [parentId]);
      const rollup = rollups[parentId];
      const next = rollup ? autoStatusFor(parent.kind, parent.status, rollup) : null;
      // Nothing to do here — and nothing above can have changed either, because
      // this parent's own status is what its parent rolls up from.
      if (!next) return;

      const from = parent.status;
      parent.setStatus(next);
      await this.issues.update(parent);

      // A cascade a person caused keeps that person as the actor — it is their
      // drag that finished the parent — with `automated` marking that they never
      // touched this card themselves. See AuditActor: only a change with no
      // human behind it is SYSTEM.
      await this.activity.execute({
        tenantId: ctx.tenantId,
        entity: AuditEntity.ISSUE,
        entityId: parent.id.toString(),
        entityRef: parent.shortId || parent.id.toString(),
        actor: {
          type: ctx.actorType ?? AuditActor.USER,
          id: ctx.requesterId,
          name: ctx.requesterName,
        },
        automated: true,
        changes: [{ field: 'status', oldValue: from, newValue: next }],
      });

      parentId = parent.parentId;
    }
  }
}
