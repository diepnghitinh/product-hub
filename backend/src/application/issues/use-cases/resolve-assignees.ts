import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IssueAssignee } from '../domain/entities/issue.props';

/**
 * Turns assignee ids into the stored `{id, name}` pairs, in the order given — the
 * first is the issue's primary assignee.
 *
 * Every id is checked against the tenant, so one bad id fails the whole write
 * rather than silently dropping a person (the message matches what the single-
 * assignee path has always returned). Names are looked up here because they're
 * denormalized onto the issue: that's what lets a board draw avatars without the
 * admin-only user list. Duplicates collapse — the entity de-dupes too, but doing
 * it here keeps the lookups down to one per person.
 */
export async function resolveIssueAssignees(
  users: IUserRepository,
  tenantId: string,
  ids: string[],
): Promise<Result<IssueAssignee[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const resolved: IssueAssignee[] = [];
  for (const id of unique) {
    const user = await users.findById(id);
    if (!user || user.tenantId !== tenantId) return Result.fail('Assignee not found');
    resolved.push({ id: user.id.toString(), name: user.name });
  }
  return Result.ok(resolved);
}
