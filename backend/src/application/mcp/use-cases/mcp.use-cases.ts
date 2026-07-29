import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { CreateIssueUseCase } from '@application/issues/use-cases/create-issue.use-case';
import { GetIssuesUseCase } from '@application/issues/use-cases/get-issues.use-case';
import { CreateIssueDto } from '@application/issues/dtos/create-issue.dto';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
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
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import { CreateDocUseCase } from '@application/docs/use-cases/doc.use-cases';
import { UpdateDocPageUseCase } from '@application/docs/use-cases/doc-page.use-cases';
import { CreateDocDto, UpdateDocPageDto } from '@application/docs/dtos/doc.dtos';
import { McpEventEntity } from '../domain/entities/mcp-event.entity';
import { McpEntity, McpTool } from '../domain/enums/mcp.enums';
import { docBodyToHtml, stripEchoedTitle } from '../domain/mcp-doc-body';
import {
  backlogItemLink,
  columnsOf,
  didYouMean,
  docPageLink,
  issueLink,
  resolvePerson,
  resolvePhase,
  resolveRoadmap,
  resolveStatus,
  resolveTeam,
  teamChoices,
} from '../domain/mcp-resolve';
import {
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpSearchIssuesDto,
} from '../dtos/mcp.dtos';
import {
  McpBacklogItemResponseDto,
  McpContextResponseDto,
  McpDocResponseDto,
  McpIssueResponseDto,
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
  /** Reported by the MCP server via `x-mcp-client`. */
  clientName: string;
}

/** Everyone in the workspace, for name-based assignee resolution. A tenant's
 *  user list is small; one page of 100 covers it without a second round-trip. */
const ALL_USERS = { page: 1, limit: 100 } as QueryUserDto;

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

    let assigneeId = '';
    if (dto.assignee) {
      const people = await this.users.findByTenant(actor.tenantId, ALL_USERS);
      const person = resolvePerson(people.data, dto.assignee);
      if (!person) {
        return Result.fail(
          didYouMean(
            'assignee',
            dto.assignee,
            people.data.map((u) => u.name),
          ),
        );
      }
      assigneeId = person.id.toString();
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
        assigneeId: assigneeId || undefined,
        startDate: dto.startDate,
        endDate: dto.endDate,
        estimate: isBug ? undefined : dto.estimate,
        severity: isBug ? dto.severity : undefined,
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
export class McpSearchIssuesUseCase
  implements
    IUsecaseExecute<{ actor: McpActor; dto: McpSearchIssuesDto }, Result<McpIssueResponseDto[]>>
{
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getIssues: GetIssuesUseCase,
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

    // userId '' keeps the private-board filter on, so a key can never read
    // someone's personal tasks.
    const result = await this.getIssues.execute({
      tenantId: actor.tenantId,
      userId: '',
      query: {
        search: dto.search,
        kind: dto.kind ? [dto.kind] : undefined,
        teamId,
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
    assigneeName: issue.assigneeName ?? '',
    severity: issue.severity ?? '',
    estimate: issue.estimate ?? 0,
    startDate: issue.startDate ?? '',
    endDate: issue.endDate ?? '',
    link: issueLink(issue.shortId || issue.id.toString()),
    updatedAt: issue.updatedAt,
  };
}
