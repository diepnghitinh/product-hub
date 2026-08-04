import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { CreateIssueUseCase } from '@application/issues/use-cases/create-issue.use-case';
import { GetIssuesUseCase } from '@application/issues/use-cases/get-issues.use-case';
import { GetIssueUseCase } from '@application/issues/use-cases/get-issue.use-case';
import { UpdateIssueUseCase } from '@application/issues/use-cases/update-issue.use-case';
import { SetIssueStatusUseCase } from '@application/issues/use-cases/set-issue-status.use-case';
import { DeleteIssueUseCase } from '@application/issues/use-cases/delete-issue.use-case';
import { CreateIssueDto } from '@application/issues/dtos/create-issue.dto';
import { UpdateIssueDto } from '@application/issues/dtos/update-issue.dto';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { GetTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import {
  AddRoadmapItemUseCase,
  GetRoadmapsUseCase,
} from '@application/roadmaps/use-cases/roadmap.use-cases';
import {
  findRoadmapItem,
  riceScore,
  type RoadmapItemData,
} from '@application/roadmaps/domain/types/roadmap-item.type';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import {
  CreateDocUseCase,
  GetDocUseCase,
  UpdateDocUseCase,
} from '@application/docs/use-cases/doc.use-cases';
import {
  CreateDocPageUseCase,
  UpdateDocPageUseCase,
} from '@application/docs/use-cases/doc-page.use-cases';
import {
  CreateDocDto,
  CreateDocPageDto,
  UpdateDocDto,
  UpdateDocPageDto,
} from '@application/docs/dtos/doc.dtos';
import {
  CreateIssueCommentUseCase,
  DeleteIssueCommentUseCase,
  GetIssueCommentsUseCase,
  UpdateIssueCommentUseCase,
} from '@application/activity/use-cases/issue-comment.use-cases';
import { CommentEntity } from '@application/activity/domain/entities/comment.entity';
import { CreateIssueLinkUseCase } from '@application/issue-links/use-cases/create-issue-link.use-case';
import { GetIssueLinksUseCase } from '@application/issue-links/use-cases/get-issue-links.use-case';
import { DeleteIssueLinkUseCase } from '@application/issue-links/use-cases/delete-issue-link.use-case';
import { IssueKind as LinkIssueKind } from '@application/issue-links/domain/relation-type.enum';
import { plainSnippet } from '@module-shared/utils/plain-text.util';
import { McpEventEntity } from '../domain/entities/mcp-event.entity';
import { McpEntity, McpTool } from '../domain/enums/mcp.enums';
import { docBodyToHtml, stripEchoedTitle } from '../domain/mcp-doc-body';
import {
  backlogItemLink,
  columnsOf,
  didYouMean,
  docPageLink,
  issueLink,
  resolveIssueRef,
  resolveLabel,
  resolveMentions,
  resolvePerson,
  resolvePhase,
  resolveRelationType,
  resolveRoadmap,
  resolveStatus,
  resolveTeam,
  teamChoices,
  RELATION_TYPE_CHOICES,
} from '../domain/mcp-resolve';
import {
  McpAddCommentDto,
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpDeleteCommentDto,
  McpDeleteIssueDto,
  McpGetIssueDto,
  McpLinkIssuesDto,
  McpListBacklogItemsDto,
  McpListCommentsDto,
  McpListLinksDto,
  McpSearchIssuesDto,
  McpSetStatusDto,
  McpUnlinkIssuesDto,
  McpUpdateCommentDto,
  McpUpdateDocDto,
  McpUpdateIssueDto,
} from '../dtos/mcp.dtos';
import {
  McpBacklogItemBriefDto,
  McpBacklogItemResponseDto,
  McpCommentDto,
  McpCommentResultDto,
  McpContextResponseDto,
  McpDeletedCommentResponseDto,
  McpDeletedIssueResponseDto,
  McpDocResponseDto,
  McpIssueDetailResponseDto,
  McpIssueLinkDto,
  McpIssueResponseDto,
  McpLinkResultDto,
  McpUnlinkResultDto,
  McpUpdatedDocResponseDto,
} from '../dtos/mcp.response.dto';
import {
  IMcpEventRepository,
  McpEventPaginationResponse,
} from '../repositories/mcp-event.repository';

/** Who is calling: the API key, and the person it belongs to. */
export interface McpActor {
  tenantId: string;
  keyId: string;
  keyName: string;
  userId: string;
  /** The key's ceiling on write/delete — what the write-gate helpers check.
   *  (The owner's *role* — for per-issue ownership — is resolved fresh from the DB
   *  by each write-wrapper via `roleOf`, not carried on the actor.) */
  scope: ApiKeyScope;
  /** Reported by the MCP server via `x-mcp-client`. */
  clientName: string;
}

/**
 * The permission a write-wrapper acts with, resolved from the key owner. A key
 * "acts as" the person who created it, so its reach over an issue is theirs:
 * `isAdmin` gates personal-task edits, `canDeleteBug` gates bug deletes — the
 * exact formula `issues.controller.ts` applies to a JWT caller.
 */
interface ActorRole {
  role: Role;
  isAdmin: boolean;
  canDeleteBug: boolean;
}

const roleOf = (user: UserEntity | null): ActorRole => {
  const role = user?.role ?? Role.TESTER;
  return {
    role,
    isAdmin: role === Role.ADMIN,
    canDeleteBug: role === Role.ADMIN || role === Role.PRODUCT,
  };
};

/** Everyone in the workspace, for name-based assignee resolution. A tenant's
 *  user list is small; one page of 100 covers it without a second round-trip. */
const ALL_USERS = { page: 1, limit: 100 } as QueryUserDto;

/** Cap on subtasks/comments read inline, so one over-large issue can't flood the
 *  assistant's context. Beyond this a client pages with search_issues/list_comments. */
const INLINE_CAP = 20;

/** How much of a comment body a tool reply carries — enough to recognise it,
 *  short enough that a long thread can't flood the assistant's context. */
const COMMENT_EXCERPT = 280;

/** Upper bound on comments `list_comments` returns. `get_issue` shows the last
 *  {@link INLINE_CAP}; the fuller list returns the most recent of these — still
 *  bounded, so a 500-comment thread can't flood the assistant in one call. */
const LIST_COMMENTS_CAP = 100;

/** Upper bound on backlog items `list_backlog_items` returns, so a huge roadmap
 *  can't flood the assistant in one call. */
const LIST_BACKLOG_CAP = 100;

/** A stored RelationType read as words for a human — `blocked_by` → "blocked by". */
const relationLabel = (rt: string): string => rt.replace(/_/g, ' ');

@Injectable()
export class GetMcpContextUseCase
  implements IUsecaseExecute<{ actor: McpActor }, Result<McpContextResponseDto>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ actor }: { actor: McpActor }): Promise<Result<McpContextResponseDto>> {
    const [teams, roadmaps, people, owner] = await Promise.all([
      this.getTeams.execute({ tenantId: actor.tenantId }),
      this.getRoadmaps.execute({ tenantId: actor.tenantId }),
      this.users.findByTenant(actor.tenantId, ALL_USERS),
      this.users.findById(actor.userId),
    ]);

    return Result.ok({
      keyName: actor.keyName,
      userName: owner?.name ?? actor.keyName,
      userEmail: owner?.email ?? '',
      teams: teams
        .getValue()
        .filter((t) => !t.archived)
        .map((t) => ({
          id: t.id.toString(),
          name: t.name,
          issueType: t.issueType,
          isDefault: t.isDefault,
          statuses: t.statuses,
        })),
      roadmaps: roadmaps.getValue().map((r) => ({
        id: r.id.toString(),
        title: r.title,
        columns: columnsOf(r),
        itemCount: r.items.length,
      })),
      people: people.data.map((u) => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
      })),
    });
  }
}

@Injectable()
export class McpCreateIssueUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpCreateIssueDto }, Result<McpIssueResponseDto>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly createIssue: CreateIssueUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpCreateIssueDto;
  }): Promise<Result<McpIssueResponseDto>> {
    const isBug = dto.kind === IssueKind.BUG;
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();

    const team = resolveTeam(teams, dto.team, dto.kind);
    if (!team) {
      return Result.fail(didYouMean('team', dto.team ?? '', teamChoices(teams, dto.kind)));
    }

    const status = resolveStatus(team.statuses, dto.status);
    if (!status) {
      return Result.fail(
        didYouMean(
          'status',
          dto.status ?? '',
          team.statuses.map((s) => s.label),
        ),
      );
    }

    // One name, or several separated by commas — an issue can be shared. Each is
    // resolved on its own so an unknown one still comes back with the choices
    // rather than silently assigning the rest.
    const assigneeIds: string[] = [];
    const wantedNames = (dto.assignee ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (wantedNames.length) {
      const people = await this.users.findByTenant(actor.tenantId, ALL_USERS);
      for (const name of wantedNames) {
        const person = resolvePerson(people.data, name);
        if (!person) {
          return Result.fail(
            didYouMean(
              'assignee',
              name,
              people.data.map((u) => u.name),
            ),
          );
        }
        assigneeIds.push(person.id.toString());
      }
    }

    // A backlog item is addressed by its ref (`RM-6HCUHKX`) or uuid — the roadmap
    // holding it is found here, because the caller has no reason to know which one
    // that is. What gets stored on the issue is always the item's uuid: that's
    // what the app's own back-links (the item's Tasks panel) read.
    let roadmapId = '';
    let roadmapItemId = '';
    let roadmapItemLabel = '';
    if (dto.backlogItemId) {
      const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
      let found: RoadmapItemData | undefined;
      const owner = roadmaps.find((r) => (found = findRoadmapItem(r.items, dto.backlogItemId)));
      if (!owner || !found) return Result.fail(`Backlog item "${dto.backlogItemId}" not found`);
      roadmapId = owner.id.toString();
      roadmapItemId = found.id;
      roadmapItemLabel = found.title;
    }

    // parent: nest this new issue under an existing one as a subtask. The ref is
    // resolved to a uuid here (create stores parentId as an id), same as update_issue.
    let parentId = '';
    if (dto.parent) {
      const parent = await resolveIssueRef(this.issues, actor.tenantId, dto.parent);
      if (!parent) return Result.fail(`Parent issue "${dto.parent}" not found`);
      parentId = parent.id.toString();
    }

    const actorUser = await this.users.findById(actor.userId);
    const created = await this.createIssue.execute({
      tenantId: actor.tenantId,
      // Attributed to the key's owner, so the item has a real author in the app's
      // activity trail; the MCP history below records that a robot typed it.
      createdBy: actor.userId,
      createdByName: actorUser?.name ?? actor.keyName,
      dto: {
        kind: dto.kind,
        title: dto.title,
        description: dto.description,
        status,
        teamId: team.id.toString(),
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
        startDate: dto.startDate,
        endDate: dto.endDate,
        estimate: isBug ? undefined : dto.estimate,
        severity: isBug ? dto.severity : undefined,
        parentId: parentId || undefined,
        roadmapId: roadmapId || undefined,
        roadmapItemId: roadmapItemId || undefined,
        roadmapItemLabel: roadmapItemLabel || undefined,
      } as CreateIssueDto,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const issue = created.getValue();
    await this.log(actor, issue, team);
    return Result.ok(toIssueResponse(issue, team.name));
  }

  private async log(actor: McpActor, issue: IssueEntity, team: TeamEntity): Promise<void> {
    const actorUser = await this.users.findById(actor.userId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.CREATE_ISSUE,
      entity: issue.kind === IssueKind.BUG ? McpEntity.BUG : McpEntity.TASK,
      entityId: issue.id.toString(),
      entityRef: issue.shortId,
      entityTitle: issue.title,
      contextLabel: team.name,
      link: issueLink(issue.shortId || issue.id.toString()),
    });
    if (event.isSuccess) await this.events.append(event.getValue());
  }
}

@Injectable()
export class McpGetIssueUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpGetIssueDto }, Result<McpIssueDetailResponseDto>>
{
  constructor(
    private readonly getIssue: GetIssueUseCase,
    private readonly getIssues: GetIssuesUseCase,
    private readonly getComments: GetIssueCommentsUseCase,
    private readonly getTeams: GetTeamsUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpGetIssueDto;
  }): Promise<Result<McpIssueDetailResponseDto>> {
    const { isAdmin } = roleOf(await this.users.findById(actor.userId));

    // GetIssueUseCase resolves the ref itself (findByRef), so no pre-resolve here.
    const found = await this.getIssue.execute({
      id: dto.issue,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
    });
    if (found.isFailure) return Result.fail(found.error as string);
    const issue = found.getValue();
    const issueId = issue.id.toString();

    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const teamName = teams.find((t) => t.id.toString() === issue.teamId)?.name ?? '';

    // Subtasks: userId '' keeps the private-board filter on so a key can never
    // surface someone else's personal task through a parent it can see. The
    // paginated `total` carries the true (visible) count so, like commentCount, a
    // reply capped at INLINE_CAP still says how many there really are.
    const childPage = (
      await this.getIssues.execute({
        tenantId: actor.tenantId,
        userId: '',
        query: { parentId: [issueId], page: 1, limit: INLINE_CAP } as QueryIssueDto,
      })
    ).getValue();

    // Comments come back oldest-first; keep the latest INLINE_CAP inline (with the
    // total count) so one 200-comment bug can't flood the reply — list_comments
    // pages the full thread.
    const allComments = (
      await this.getComments.execute({ tenantId: actor.tenantId, issueId })
    ).getValue();
    const recent = allComments.slice(-INLINE_CAP);

    return Result.ok({
      id: issueId,
      kind: issue.kind,
      shortId: issue.shortId,
      title: issue.title,
      description: issue.description ?? '',
      status: issue.status,
      teamId: issue.teamId,
      teamName,
      assigneeNames: issue.assignees.map((a) => a.name),
      severity: issue.severity ?? '',
      estimate: issue.estimate ?? 0,
      startDate: issue.startDate ?? '',
      endDate: issue.endDate ?? '',
      labelKeys: issue.labelKeys,
      subtasks: childPage.data.map((s) => ({
        id: s.id.toString(),
        shortId: s.shortId,
        title: s.title,
        status: s.status,
      })),
      subtaskCount: childPage.total,
      comments: recent.map(toCommentDto),
      commentCount: allComments.length,
      link: issueLink(issue.shortId || issueId),
      updatedAt: issue.updatedAt,
    });
  }
}

@Injectable()
export class McpUpdateIssueUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpUpdateIssueDto }, Result<McpIssueResponseDto>>
{
  constructor(
    private readonly updateIssue: UpdateIssueUseCase,
    private readonly getTeams: GetTeamsUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpUpdateIssueDto;
  }): Promise<Result<McpIssueResponseDto>> {
    const actorUser = await this.users.findById(actor.userId);
    const { isAdmin } = roleOf(actorUser);

    // Ref → uuid before the write use-case, which is findById (uuid) only.
    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);

    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const team = teams.find((t) => t.id.toString() === issue.teamId);

    const update: UpdateIssueDto = {};
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.cycleId !== undefined) update.cycleId = dto.cycleId;
    if (dto.estimate !== undefined) update.estimate = dto.estimate;
    if (dto.severity !== undefined) update.severity = dto.severity;
    if (dto.startDate !== undefined) update.startDate = dto.startDate;
    if (dto.endDate !== undefined) update.endDate = dto.endDate;

    // assignee: REPLACES the whole set. '' (or blank) unassigns everyone.
    if (dto.assignee !== undefined) {
      const wantedNames = dto.assignee
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const assigneeIds: string[] = [];
      if (wantedNames.length) {
        const people = await this.users.findByTenant(actor.tenantId, ALL_USERS);
        for (const name of wantedNames) {
          const person = resolvePerson(people.data, name);
          if (!person) {
            return Result.fail(
              didYouMean(
                'assignee',
                name,
                people.data.map((u) => u.name),
              ),
            );
          }
          assigneeIds.push(person.id.toString());
        }
      }
      update.assigneeIds = assigneeIds;
    }

    // labels: team label keys, REPLACES the whole set. [] clears.
    if (dto.labels !== undefined) {
      if (!team) return Result.fail('Only a team issue can carry labels');
      const labelKeys: string[] = [];
      for (const ref of dto.labels) {
        const label = resolveLabel(team.labels, ref);
        if (!label) {
          return Result.fail(
            didYouMean(
              'label',
              ref,
              team.labels.map((l) => l.name),
            ),
          );
        }
        labelKeys.push(label.key);
      }
      update.labelKeys = labelKeys;
    }

    // parent: ref/id to nest under; '' detaches.
    if (dto.parent !== undefined) {
      if (dto.parent === '') {
        update.parentId = '';
      } else {
        const parent = await resolveIssueRef(this.issues, actor.tenantId, dto.parent);
        if (!parent) return Result.fail(`Parent issue "${dto.parent}" not found`);
        update.parentId = parent.id.toString();
      }
    }

    // backlogItem: ref/id to link; '' unlinks. The roadmap holding it is resolved
    // here — only the item's uuid is stored, exactly as create_issue does.
    if (dto.backlogItem !== undefined) {
      if (dto.backlogItem === '') {
        update.roadmapItemId = '';
        update.roadmapItemLabel = '';
      } else {
        const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
        let match: RoadmapItemData | undefined;
        const owner = roadmaps.find((r) => (match = findRoadmapItem(r.items, dto.backlogItem)));
        if (!owner || !match) return Result.fail(`Backlog item "${dto.backlogItem}" not found`);
        update.roadmapId = owner.id.toString();
        update.roadmapItemId = match.id;
        update.roadmapItemLabel = match.title;
      }
    }

    const result = await this.updateIssue.execute({
      id: issue.id.toString(),
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
      dto: update,
    });
    if (result.isFailure) return Result.fail(result.error as string);

    const saved = result.getValue();
    const teamName = team?.name ?? '';
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.UPDATE_ISSUE,
      entity: saved.kind === IssueKind.BUG ? McpEntity.BUG : McpEntity.TASK,
      entityId: saved.id.toString(),
      entityRef: saved.shortId,
      entityTitle: saved.title,
      contextLabel: teamName,
      link: issueLink(saved.shortId || saved.id.toString()),
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok(toIssueResponse(saved, teamName));
  }
}

@Injectable()
export class McpSetStatusUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpSetStatusDto }, Result<McpIssueResponseDto>>
{
  constructor(
    private readonly setStatus: SetIssueStatusUseCase,
    private readonly getTeams: GetTeamsUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpSetStatusDto;
  }): Promise<Result<McpIssueResponseDto>> {
    const actorUser = await this.users.findById(actor.userId);
    const { isAdmin } = roleOf(actorUser);

    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);

    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const team = teams.find((t) => t.id.toString() === issue.teamId);

    // Validate the status against the issue's own team board. A personal task has
    // no team columns to check against, so its status passes through unchanged.
    let status = dto.status;
    if (team) {
      const resolved = resolveStatus(team.statuses, dto.status);
      if (!resolved) {
        return Result.fail(
          didYouMean(
            'status',
            dto.status,
            team.statuses.map((s) => s.label),
          ),
        );
      }
      status = resolved;
    }

    const result = await this.setStatus.execute({
      id: issue.id.toString(),
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
      status,
    });
    if (result.isFailure) return Result.fail(result.error as string);

    const saved = result.getValue();
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.SET_STATUS,
      entity: saved.kind === IssueKind.BUG ? McpEntity.BUG : McpEntity.TASK,
      entityId: saved.id.toString(),
      entityRef: saved.shortId,
      entityTitle: saved.title,
      contextLabel: team?.name ?? '',
      link: issueLink(saved.shortId || saved.id.toString()),
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok(toIssueResponse(saved, team?.name ?? ''));
  }
}

@Injectable()
export class McpDeleteIssueUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpDeleteIssueDto }, Result<McpDeletedIssueResponseDto>>
{
  constructor(
    private readonly deleteIssue: DeleteIssueUseCase,
    private readonly getIssues: GetIssuesUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpDeleteIssueDto;
  }): Promise<Result<McpDeletedIssueResponseDto>> {
    const actorUser = await this.users.findById(actor.userId);
    const { isAdmin, canDeleteBug } = roleOf(actorUser);

    // Ref → uuid, and a snapshot of the entity read *before* the hard delete — the
    // delete use-case cascades nothing, so this is the only forensic trace left.
    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);
    const issueId = issue.id.toString();

    // A delete cannot orphan subtasks (Q#4). The count is authoritative and owner-
    // blind (`countChildren`) so a *personal* child still blocks the delete; the
    // listed refs come from the privacy-filtered read, so the message never leaks
    // another user's private task title. If some children are private, the count
    // exceeds the list and we say so rather than under-reporting.
    const childCount = await this.issues.countChildren(actor.tenantId, issueId);
    if (childCount > 0) {
      const visible = (
        await this.getIssues.execute({
          tenantId: actor.tenantId,
          userId: '',
          query: { parentId: [issueId], page: 1, limit: INLINE_CAP } as QueryIssueDto,
        })
      ).getValue().data;
      const shown = visible.map((k) => `${k.shortId} · ${k.title}`).join(', ');
      const hidden = childCount - visible.length;
      const tail = hidden > 0 ? `${shown ? ', ' : ''}and ${hidden} more` : '';
      return Result.fail(
        `Cannot delete ${issue.shortId || issueId} — it still has ${childCount} subtask(s): ` +
          `${shown}${tail}. Move or delete them first.`,
      );
    }

    const snapshot: McpDeletedIssueResponseDto = {
      id: issueId,
      kind: issue.kind,
      shortId: issue.shortId,
      title: issue.title,
    };

    const result = await this.deleteIssue.execute({
      id: issueId,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
      canDeleteBug,
    });
    if (result.isFailure) return Result.fail(result.error as string);

    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.DELETE_ISSUE,
      entity: issue.kind === IssueKind.BUG ? McpEntity.BUG : McpEntity.TASK,
      entityId: issueId,
      entityRef: issue.shortId,
      entityTitle: issue.title,
      contextLabel: '',
      link: issueLink(issue.shortId || issueId),
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok(snapshot);
  }
}

@Injectable()
export class McpListCommentsUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpListCommentsDto }, Result<McpCommentDto[]>>
{
  constructor(
    private readonly getIssue: GetIssueUseCase,
    private readonly getComments: GetIssueCommentsUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListCommentsDto;
  }): Promise<Result<McpCommentDto[]>> {
    const { isAdmin } = roleOf(await this.users.findById(actor.userId));

    // Resolve the ref *and* confirm the key may see this issue in one step —
    // GetIssueUseCase enforces tenant + personal-task privacy. A ref the actor
    // can't read comes back "not found" here, never leaking the thread.
    const found = await this.getIssue.execute({
      id: dto.issue,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
    });
    if (found.isFailure) return Result.fail(found.error as string);

    const comments = (
      await this.getComments.execute({
        tenantId: actor.tenantId,
        issueId: found.getValue().id.toString(),
      })
    ).getValue();
    // Bound the reply: the thread is oldest-first, so the most recent
    // LIST_COMMENTS_CAP is the tail. A hotter thread than that is rare, and the
    // assistant already has get_issue for a quick look.
    const recent = comments.slice(-LIST_COMMENTS_CAP);
    return Result.ok(recent.map(toCommentDto));
  }
}

@Injectable()
export class McpAddCommentUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpAddCommentDto }, Result<McpCommentResultDto>>
{
  constructor(
    private readonly createComment: CreateIssueCommentUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpAddCommentDto;
  }): Promise<Result<McpCommentResultDto>> {
    const actorUser = await this.users.findById(actor.userId);

    // The comment use-case takes the issue's uuid, so resolve the ref first.
    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);

    // Names/emails → userIds before they reach the DTO, so the @mention webhook
    // pings the right people.
    const people = await this.users.findByTenant(actor.tenantId, ALL_USERS);
    const mentions = resolveMentions(people.data, dto.mentions);
    if (mentions.isFailure) return Result.fail(mentions.error as string);

    const created = await this.createComment.execute({
      tenantId: actor.tenantId,
      issueId: issue.id.toString(),
      authorId: actor.userId,
      authorName: actorUser?.name ?? actor.keyName,
      dto: {
        // Convert Markdown to the editor's HTML (same net as create_doc) so a
        // ```code``` fence or a **bold** line renders instead of showing literal
        // markup; HTML the caller sent passes straight through.
        body: docBodyToHtml(dto.body),
        parentId: dto.replyTo,
        mentions: mentions.getValue(),
      },
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await logCommentEvent(
      this.events,
      this.users,
      actor,
      McpTool.ADD_COMMENT,
      comment.id.toString(),
      issue,
    );
    return Result.ok(toCommentResult(comment, issue));
  }
}

@Injectable()
export class McpUpdateCommentUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpUpdateCommentDto }, Result<McpCommentResultDto>>
{
  constructor(
    private readonly updateComment: UpdateIssueCommentUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpUpdateCommentDto;
  }): Promise<Result<McpCommentResultDto>> {
    const { role } = roleOf(await this.users.findById(actor.userId));

    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);

    // mentions REPLACES the set; only resolve when the caller sent the field so an
    // omitted `mentions` leaves the existing ones untouched.
    let mentions: string[] | undefined;
    if (dto.mentions !== undefined) {
      const people = await this.users.findByTenant(actor.tenantId, ALL_USERS);
      const resolved = resolveMentions(people.data, dto.mentions);
      if (resolved.isFailure) return Result.fail(resolved.error as string);
      mentions = resolved.getValue();
    }

    const result = await this.updateComment.execute({
      tenantId: actor.tenantId,
      issueId: issue.id.toString(),
      commentId: dto.comment,
      userId: actor.userId,
      role,
      // Only convert when a body was actually sent — an omitted body means "leave
      // it unchanged", so it must stay undefined rather than becoming ''.
      dto: { body: dto.body !== undefined ? docBodyToHtml(dto.body) : undefined, mentions },
    });
    // Surfaces COMMENT_FORBIDDEN ("You can only edit your own comments") verbatim.
    if (result.isFailure) return Result.fail(result.error as string);

    const comment = result.getValue();
    await logCommentEvent(
      this.events,
      this.users,
      actor,
      McpTool.UPDATE_COMMENT,
      comment.id.toString(),
      issue,
    );
    return Result.ok(toCommentResult(comment, issue));
  }
}

@Injectable()
export class McpDeleteCommentUseCase
  implements
    IUsecaseExecute<
      { actor: McpActor; dto: McpDeleteCommentDto },
      Result<McpDeletedCommentResponseDto>
    >
{
  constructor(
    private readonly deleteComment: DeleteIssueCommentUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpDeleteCommentDto;
  }): Promise<Result<McpDeletedCommentResponseDto>> {
    const { role } = roleOf(await this.users.findById(actor.userId));

    const issue = await resolveIssueRef(this.issues, actor.tenantId, dto.issue);
    if (!issue) return Result.fail(`Issue "${dto.issue}" not found`);

    const result = await this.deleteComment.execute({
      tenantId: actor.tenantId,
      issueId: issue.id.toString(),
      commentId: dto.comment,
      userId: actor.userId,
      role,
    });
    // Surfaces COMMENT_DELETE_FORBIDDEN ("You can only delete your own comments").
    if (result.isFailure) return Result.fail(result.error as string);

    await logCommentEvent(
      this.events,
      this.users,
      actor,
      McpTool.DELETE_COMMENT,
      dto.comment,
      issue,
    );
    return Result.ok({ id: dto.comment, issueShortId: issue.shortId });
  }
}

@Injectable()
export class McpCreateBacklogItemUseCase
  implements
    IUsecaseExecute<
      { actor: McpActor; dto: McpCreateBacklogItemDto },
      Result<McpBacklogItemResponseDto>
    >
{
  constructor(
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly addItem: AddRoadmapItemUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpCreateBacklogItemDto;
  }): Promise<Result<McpBacklogItemResponseDto>> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
    if (!roadmaps.length) {
      return Result.fail('This workspace has no roadmap yet — create one in the app first');
    }

    const roadmap = resolveRoadmap(roadmaps, dto.roadmap);
    if (!roadmap) {
      return Result.fail(
        didYouMean(
          'roadmap',
          dto.roadmap ?? '',
          roadmaps.map((r) => r.title),
        ),
      );
    }

    const columns = columnsOf(roadmap);
    const phase = resolvePhase(columns, dto.phase);
    if (!phase) {
      return Result.fail(
        didYouMean(
          'column',
          dto.phase ?? '',
          columns.map((c) => c.label),
        ),
      );
    }

    const added = await this.addItem.execute({
      id: roadmap.id.toString(),
      tenantId: actor.tenantId,
      item: {
        title: dto.title,
        description: dto.description,
        phase,
        status: dto.status,
        difficulty: dto.difficulty,
        reach: dto.reach,
        impact: dto.impact,
        confidence: dto.confidence,
        effort: dto.effort,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
    if (added.isFailure) return Result.fail(added.error as string);

    const { item } = added.getValue();
    const roadmapId = roadmap.id.toString();
    const link = backlogItemLink(roadmapId, item.shortId || item.id);

    const actorUser = await this.users.findById(actor.userId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.CREATE_BACKLOG_ITEM,
      entity: McpEntity.BACKLOG_ITEM,
      entityId: item.id,
      entityRef: item.shortId,
      entityTitle: item.title,
      contextLabel: roadmap.title,
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({
      id: item.id,
      shortId: item.shortId ?? '',
      roadmapId,
      roadmapTitle: roadmap.title,
      title: item.title,
      phase: item.phase,
      status: item.status,
      riceScore: riceScore(item),
      link,
    });
  }
}

@Injectable()
export class McpCreateDocUseCase
  implements IUsecaseExecute<{ actor: McpActor; dto: McpCreateDocDto }, Result<McpDocResponseDto>>
{
  constructor(
    private readonly createDoc: CreateDocUseCase,
    private readonly updatePage: UpdateDocPageUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpCreateDocDto;
  }): Promise<Result<McpDocResponseDto>> {
    const actorUser = await this.users.findById(actor.userId);
    const author = { userId: actor.userId, name: actorUser?.name ?? actor.keyName };

    const created = await this.createDoc.execute({
      tenantId: actor.tenantId,
      author,
      dto: { title: dto.title, tags: dto.tags } as CreateDocDto,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    // A new doc already carries one page named after it. The write-up goes
    // there, so the doc opens on the text instead of an empty page the user has
    // to notice and fill in themselves.
    const { doc, pages } = created.getValue();
    const page = pages[0];
    const docId = doc.id.toString();
    const pageId = page.id.toString();

    const content = stripEchoedTitle(docBodyToHtml(dto.content), doc.title);
    if (content) {
      const written = await this.updatePage.execute({
        docId,
        pageId,
        tenantId: actor.tenantId,
        author,
        dto: { content } as UpdateDocPageDto,
      });
      if (written.isFailure) return Result.fail(written.error as string);
    }

    const link = docPageLink(docId, pageId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: author.name,
      clientName: actor.clientName,
      tool: McpTool.CREATE_DOC,
      entity: McpEntity.DOC,
      entityId: docId,
      entityTitle: doc.title,
      // A doc has no team or roadmap behind it; its tags are the nearest thing
      // to the context the other history rows show.
      contextLabel: doc.tags.join(', '),
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({ id: docId, pageId, title: doc.title, tags: doc.tags, link });
  }
}

@Injectable()
export class McpUpdateDocUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpUpdateDocDto }, Result<McpUpdatedDocResponseDto>>
{
  constructor(
    private readonly getDoc: GetDocUseCase,
    private readonly updateDoc: UpdateDocUseCase,
    private readonly updatePage: UpdateDocPageUseCase,
    private readonly createPage: CreateDocPageUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpUpdateDocDto;
  }): Promise<Result<McpUpdatedDocResponseDto>> {
    const actorUser = await this.users.findById(actor.userId);
    const author = { userId: actor.userId, name: actorUser?.name ?? actor.keyName };

    const wantsTitleOrTags = dto.title !== undefined || dto.tags !== undefined;
    if (!wantsTitleOrTags && dto.content === undefined && !dto.appendPage) {
      return Result.fail('Nothing to update — pass title, tags, content or appendPage.');
    }

    // Resolve the doc (ref or id) once, and read its pages so the default page and
    // any explicit `page` can be found. GetDocUseCase enforces the tenant.
    const found = await this.getDoc.execute({ id: dto.doc, tenantId: actor.tenantId });
    if (found.isFailure) return Result.fail(found.error as string);
    const { doc, pages } = found.getValue();
    const docId = doc.id.toString();

    // The operations have no shared transaction, so they run in a fixed order and
    // each success is recorded; a later failure reports what already went through
    // rather than pretending the whole call succeeded or all of it rolled back.
    const changed: string[] = [];
    let linkPageId = pages[0]?.id.toString() ?? '';

    // 1) Doc-level metadata.
    if (wantsTitleOrTags) {
      const meta = await this.updateDoc.execute({
        id: docId,
        tenantId: actor.tenantId,
        dto: { title: dto.title, tags: dto.tags } as UpdateDocDto,
      });
      if (meta.isFailure) return Result.fail(meta.error as string);
      if (dto.title !== undefined) changed.push('renamed');
      if (dto.tags !== undefined) changed.push('retagged');
    }

    // 2) Replace one page's body. The target is the given `page`, else the doc's
    //    first page (pages come back ordered, so pages[0] is the opening page —
    //    the same one create_doc writes into).
    if (dto.content !== undefined) {
      const target = dto.page
        ? pages.find((p) => p.id.toString() === dto.page)
        : pages[0];
      if (!target) {
        return this.partial(changed, `Page "${dto.page}" not found in this doc`);
      }
      const pageId = target.id.toString();
      const content = stripEchoedTitle(docBodyToHtml(dto.content), target.title);
      const written = await this.updatePage.execute({
        docId,
        pageId,
        tenantId: actor.tenantId,
        author,
        dto: { content } as UpdateDocPageDto,
      });
      if (written.isFailure) return this.partial(changed, written.error as string);
      linkPageId = pageId;
      changed.push('edited a page');
    }

    // 3) Append a brand-new page.
    if (dto.appendPage) {
      const created = await this.createPage.execute({
        docId,
        tenantId: actor.tenantId,
        author,
        dto: {
          title: dto.appendPage.title,
          content: stripEchoedTitle(
            docBodyToHtml(dto.appendPage.content),
            dto.appendPage.title,
          ),
        } as CreateDocPageDto,
      });
      if (created.isFailure) return this.partial(changed, created.error as string);
      linkPageId = created.getValue().id.toString();
      changed.push('added a page');
    }

    // The metadata write, if any, returned a fresh doc; otherwise the read is
    // still current for title/tags. Re-read is unnecessary — nothing else changed
    // the doc-level fields.
    const title = dto.title ?? doc.title;
    const tags = dto.tags ?? doc.tags;
    const link = docPageLink(docId, linkPageId);

    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: author.name,
      clientName: actor.clientName,
      tool: McpTool.UPDATE_DOC,
      entity: McpEntity.DOC,
      entityId: docId,
      entityTitle: title,
      contextLabel: tags.join(', '),
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({ id: docId, title, tags, link, changed: changed.join(', ') });
  }

  /** A later step failed after an earlier one committed — say which succeeded so
   *  the caller sees the doc is half-edited rather than untouched. */
  private partial(done: string[], error: string): Result<McpUpdatedDocResponseDto> {
    if (!done.length) return Result.fail(error);
    return Result.fail(`Partially applied (${done.join(', ')}), then failed: ${error}`);
  }
}

@Injectable()
export class McpSearchIssuesUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpSearchIssuesDto }, Result<McpIssueResponseDto[]>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getIssues: GetIssuesUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpSearchIssuesDto;
  }): Promise<Result<McpIssueResponseDto[]>> {
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const byId = new Map(teams.map((t) => [t.id.toString(), t.name]));

    let teamId: string | undefined;
    if (dto.team) {
      const team = resolveTeam(teams, dto.team, dto.kind ?? IssueKind.TASK);
      if (!team) {
        return Result.fail(
          didYouMean('team', dto.team, teamChoices(teams, dto.kind ?? IssueKind.TASK)),
        );
      }
      teamId = team.id.toString();
    }

    // parent: list an issue's subtasks. Resolve the ref to a uuid — parentId is
    // stored as an id — so "search_issues parent: TSK-7" reads TSK-7's children.
    let parentId: string[] | undefined;
    if (dto.parent) {
      const parent = await resolveIssueRef(this.issues, actor.tenantId, dto.parent);
      if (!parent) return Result.fail(`Parent issue "${dto.parent}" not found`);
      parentId = [parent.id.toString()];
    }

    // backlog: list the tickets filed under a roadmap item. The ref/uuid is
    // resolved to the item's uuid across every roadmap — the same lookup
    // create_issue uses — because the issue stores that uuid, not the ref.
    let roadmapItemId: string[] | undefined;
    if (dto.backlog) {
      const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
      let found: RoadmapItemData | undefined;
      const owner = roadmaps.find((r) => (found = findRoadmapItem(r.items, dto.backlog)));
      if (!owner || !found) return Result.fail(`Backlog item "${dto.backlog}" not found`);
      roadmapItemId = [found.id];
    }

    // userId '' keeps the private-board filter on, so a key can never read
    // someone's personal tasks.
    const result = await this.getIssues.execute({
      tenantId: actor.tenantId,
      userId: '',
      query: {
        search: dto.search,
        kind: dto.kind ? [dto.kind] : undefined,
        teamId,
        parentId,
        roadmapItemId,
        page: 1,
        limit: dto.limit ?? 20,
      } as QueryIssueDto,
    });

    return Result.ok(
      result.getValue().data.map((i) => toIssueResponse(i, byId.get(i.teamId) ?? '')),
    );
  }
}

@Injectable()
export class McpListBacklogItemsUseCase
  implements
    IUsecaseExecute<
      { actor: McpActor; dto: McpListBacklogItemsDto },
      Result<McpBacklogItemBriefDto[]>
    >
{
  constructor(private readonly getRoadmaps: GetRoadmapsUseCase) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListBacklogItemsDto;
  }): Promise<Result<McpBacklogItemBriefDto[]>> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();

    // A named roadmap narrows the browse; omitted lists every one. An unknown name
    // fails with the choices rather than silently returning nothing.
    let pool = roadmaps;
    if (dto.roadmap) {
      const roadmap = resolveRoadmap(roadmaps, dto.roadmap);
      if (!roadmap) {
        return Result.fail(
          didYouMean(
            'roadmap',
            dto.roadmap,
            roadmaps.map((r) => r.title),
          ),
        );
      }
      pool = [roadmap];
    }

    const items: McpBacklogItemBriefDto[] = [];
    for (const roadmap of pool) {
      const roadmapId = roadmap.id.toString();
      for (const item of roadmap.items) {
        items.push({
          shortId: item.shortId ?? '',
          title: item.title,
          phase: item.phase,
          status: item.status,
          riceScore: riceScore(item),
          roadmapTitle: roadmap.title,
          link: backlogItemLink(roadmapId, item.shortId || item.id),
        });
      }
    }
    // Bound the reply — backlogs are usually small, but one huge roadmap
    // shouldn't flood the assistant. Filter by `roadmap` to see the rest.
    return Result.ok(items.slice(0, LIST_BACKLOG_CAP));
  }
}

@Injectable()
export class McpLinkIssuesUseCase
  implements IUsecaseExecute<{ actor: McpActor; dto: McpLinkIssuesDto }, Result<McpLinkResultDto>>
{
  constructor(
    private readonly createLink: CreateIssueLinkUseCase,
    private readonly getIssue: GetIssueUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpLinkIssuesDto;
  }): Promise<Result<McpLinkResultDto>> {
    // A friendly word ("blocks", "blocked-by") maps onto a stored RelationType;
    // an unknown one fails listing the valid words rather than guessing.
    const relationType = resolveRelationType(dto.type);
    if (!relationType) {
      return Result.fail(didYouMean('relation type', dto.type, RELATION_TYPE_CHOICES));
    }

    // Both ends resolve through GetIssueUseCase, which enforces personal-task
    // privacy — so a key can only link issues it may actually see, and can't reach
    // (or later read back via list_links) another user's private task by ref.
    const actorUser = await this.users.findById(actor.userId);
    const { isAdmin } = roleOf(actorUser);
    const fromR = await this.getIssue.execute({
      id: dto.from,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
    });
    if (fromR.isFailure) return Result.fail(`Issue "${dto.from}" not found`);
    const from = fromR.getValue();
    const toR = await this.getIssue.execute({
      id: dto.to,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
    });
    if (toR.isFailure) return Result.fail(`Issue "${dto.to}" not found`);
    const to = toR.getValue();

    const issueType = from.kind === IssueKind.BUG ? LinkIssueKind.Bug : LinkIssueKind.Task;
    const result = await this.createLink.execute({
      tenantId: actor.tenantId,
      createdBy: actor.userId,
      issueType,
      sourceId: from.id.toString(),
      targetId: to.id.toString(),
      relationType,
    });
    if (result.isFailure) return Result.fail(result.error as string);

    const contextLabel = `${from.shortId} ${relationLabel(relationType)} ${to.shortId}`;
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.LINK_ISSUES,
      entity: McpEntity.LINK,
      entityId: from.id.toString(),
      entityRef: from.shortId,
      entityTitle: from.title,
      contextLabel,
      link: issueLink(from.shortId || from.id.toString()),
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({
      fromShortId: from.shortId,
      toShortId: to.shortId,
      relationType,
    });
  }
}

@Injectable()
export class McpListLinksUseCase
  implements IUsecaseExecute<{ actor: McpActor; dto: McpListLinksDto }, Result<McpIssueLinkDto[]>>
{
  constructor(
    private readonly getIssue: GetIssueUseCase,
    private readonly getLinks: GetIssueLinksUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListLinksDto;
  }): Promise<Result<McpIssueLinkDto[]>> {
    const { isAdmin } = roleOf(await this.users.findById(actor.userId));

    // Resolve the ref *and* confirm the key may see this issue in one step —
    // GetIssueUseCase enforces tenant + personal-task privacy, so a ref the actor
    // can't read comes back "not found" rather than leaking its relations.
    const found = await this.getIssue.execute({
      id: dto.issue,
      tenantId: actor.tenantId,
      requesterId: actor.userId,
      isAdmin,
    });
    if (found.isFailure) return Result.fail(found.error as string);

    const links = (
      await this.getLinks.execute({
        tenantId: actor.tenantId,
        issueId: found.getValue().id.toString(),
      })
    ).getValue();

    return Result.ok(
      links.map((l) => ({
        id: l.id,
        relationType: l.relationType,
        targetShortId: l.targetShortId,
        targetTitle: l.targetTitle,
        targetStatus: l.targetStatus,
      })),
    );
  }
}

@Injectable()
export class McpUnlinkIssuesUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpUnlinkIssuesDto }, Result<McpUnlinkResultDto>>
{
  constructor(
    private readonly deleteLink: DeleteIssueLinkUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpUnlinkIssuesDto;
  }): Promise<Result<McpUnlinkResultDto>> {
    // The link id is opaque and tenant-scoped; the delete use-case fails "Relation
    // not found" if it's unknown or belongs to another tenant.
    const result = await this.deleteLink.execute({ tenantId: actor.tenantId, id: dto.link });
    if (result.isFailure) return Result.fail(result.error as string);

    const actorUser = await this.users.findById(actor.userId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.UNLINK_ISSUES,
      entity: McpEntity.LINK,
      entityId: dto.link,
      entityTitle: '',
      contextLabel: '',
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({ linkId: dto.link });
  }
}

@Injectable()
export class GetMcpEventsUseCase
  implements
    IUsecaseExecute<{ tenantId: string; query: PaginationDto }, Result<McpEventPaginationResponse>>
{
  constructor(@Inject(IMcpEventRepository) private readonly events: IMcpEventRepository) {}

  async execute({
    tenantId,
    query,
  }: {
    tenantId: string;
    query: PaginationDto;
  }): Promise<Result<McpEventPaginationResponse>> {
    return Result.ok(await this.events.findByTenant(tenantId, query));
  }
}

/** One comment line for a listing/detail reply — body flattened and excerpted. */
function toCommentDto(comment: CommentEntity): McpCommentDto {
  return {
    id: comment.id.toString(),
    authorName: comment.authorName,
    excerpt: plainSnippet(comment.body, COMMENT_EXCERPT),
    parentId: comment.parentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

/** The reply add_comment/update_comment return — the comment plus its issue link. */
function toCommentResult(comment: CommentEntity, issue: IssueEntity): McpCommentResultDto {
  return {
    id: comment.id.toString(),
    issueId: issue.id.toString(),
    issueShortId: issue.shortId,
    authorName: comment.authorName,
    excerpt: plainSnippet(comment.body, COMMENT_EXCERPT),
    parentId: comment.parentId,
    link: issueLink(issue.shortId || issue.id.toString()),
  };
}

/**
 * One history row for a comment action. The entity is COMMENT; `entityId` is the
 * comment, while the ref/title/context point at the issue it lives on so the row
 * links somewhere clickable (a comment has no page of its own).
 */
async function logCommentEvent(
  events: IMcpEventRepository,
  users: IUserRepository,
  actor: McpActor,
  tool: McpTool,
  commentId: string,
  issue: IssueEntity,
): Promise<void> {
  const actorUser = await users.findById(actor.userId);
  const event = McpEventEntity.create({
    tenantId: actor.tenantId,
    keyId: actor.keyId,
    keyName: actor.keyName,
    userId: actor.userId,
    userName: actorUser?.name ?? actor.keyName,
    clientName: actor.clientName,
    tool,
    entity: McpEntity.COMMENT,
    entityId: commentId,
    entityRef: issue.shortId,
    entityTitle: issue.title,
    contextLabel: issue.shortId,
    link: issueLink(issue.shortId || issue.id.toString()),
  });
  if (event.isSuccess) await events.append(event.getValue());
}

/** One issue shape for every MCP reply — create and search read the same. */
function toIssueResponse(issue: IssueEntity, teamName: string): McpIssueResponseDto {
  return {
    id: issue.id.toString(),
    kind: issue.kind,
    shortId: issue.shortId,
    title: issue.title,
    status: issue.status,
    teamId: issue.teamId,
    teamName,
    assigneeNames: issue.assignees.map((a) => a.name),
    severity: issue.severity ?? '',
    estimate: issue.estimate ?? 0,
    startDate: issue.startDate ?? '',
    endDate: issue.endDate ?? '',
    link: issueLink(issue.shortId || issue.id.toString()),
    updatedAt: issue.updatedAt,
  };
}
