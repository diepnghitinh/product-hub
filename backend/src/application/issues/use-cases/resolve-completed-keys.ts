import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IssueEntity } from '../domain/entities/issue.entity';

/**
 * Which status keys mean **done** for the board this issue lives on.
 *
 * An issue's board is either a team's (its `completed`-category columns) or, for
 * a private personal task, its owner's. This is the one place that choice is
 * made, so every write path — create, drag, ClickUp echo — agrees about when to
 * stamp `resolvedAt`.
 *
 * Returns `undefined` when the board can't be loaded, which the entity reads as
 * "use the shipped keys": a lookup failing must not quietly un-finish work.
 */
export async function resolveCompletedKeys(
  teams: ITeamRepository,
  users: IUserRepository,
  opts: { tenantId: string; teamId?: string; ownerId?: string },
): Promise<string[] | undefined> {
  if (opts.ownerId) {
    const user = await users.findById(opts.ownerId);
    return user?.completedStatusKeys;
  }
  if (!opts.teamId) return undefined;
  const team = await teams.findById(opts.tenantId, opts.teamId);
  return team?.completedStatusKeys;
}

/** The same question asked about an issue already loaded. */
export function completedKeysForIssue(
  teams: ITeamRepository,
  users: IUserRepository,
  issue: IssueEntity,
): Promise<string[] | undefined> {
  return resolveCompletedKeys(teams, users, {
    tenantId: issue.tenantId,
    teamId: issue.teamId,
    ownerId: issue.ownerId,
  });
}
