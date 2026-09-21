import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { CreateIssueUseCase } from '@application/issues/use-cases/create-issue.use-case';
import { GetIssuesUseCase } from '@application/issues/use-cases/get-issues.use-case';
import { GetIssueUseCase } from '@application/issues/use-cases/get-issue.use-case';
import { CreateIssueDto } from '@application/issues/dtos/create-issue.dto';
import { QueryIssueDto } from '@application/issues/dtos/query-issue.dto';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { GetTeamsUseCase } from '@application/teams/use-cases/team.use-cases';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import {
  AddRoadmapItemAttachmentUseCase,
  AddRoadmapItemUseCase,
  GetRoadmapsUseCase,
  UpdateRoadmapItemUseCase,
} from '@application/roadmaps/use-cases/roadmap.use-cases';
import { GetRoadmapTemplatesUseCase } from '@application/roadmaps/use-cases/roadmap-template.use-cases';
import { RoadmapEntity } from '@application/roadmaps/domain/entities/roadmap.entity';
import {
  findRoadmapItem,
  riceScore,
  type RoadmapItemData,
} from '@application/roadmaps/domain/types/roadmap-item.type';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import {
  CreateDocUseCase,
  GetDocsUseCase,
  GetDocUseCase,
} from '@application/docs/use-cases/doc.use-cases';
import {
  CreateDocPageUseCase,
  UpdateDocPageUseCase,
} from '@application/docs/use-cases/doc-page.use-cases';
import {
  CreateDocDto,
  CreateDocPageDto,
  UpdateDocPageDto,
} from '@application/docs/dtos/doc.dtos';
import { DocEntity } from '@application/docs/domain/entities/doc.entity';
import { DocPageEntity } from '@application/docs/domain/entities/doc-page.entity';
import { DocViewer } from '@application/docs/repositories/doc.repository';
import { GetProjectsUseCase } from '@application/projects/use-cases';
import { QueryProjectDto } from '@application/projects/dtos/query-project.dto';
import { GetProjectStatsUseCase } from '@application/reports/use-cases';
import { CreateRoadmapItemCommentUseCase } from '@application/activity/use-cases/roadmap-item-comment.use-cases';
import { UploadMediaUseCase } from '@application/storage/use-cases/upload-media.use-case';
import { MAX_ATTACHMENTS } from '@application/storage/domain/stored-file.type';
import { plainSnippet } from '@module-shared/utils/plain-text.util';
import { McpEventEntity } from '../domain/entities/mcp-event.entity';
import { McpEntity, McpTool } from '../domain/enums/mcp.enums';
import { docBodyToHtml, htmlToReadableText, stripEchoedTitle } from '../domain/mcp-doc-body';
import {
  backlogItemLink,
  columnsOf,
  didYouMean,
  docLink,
  docPageLink,
  issueLink,
  pageKey,
  resolveDoc,
  resolveDocPage,
  resolvePerson,
  resolvePhase,
  resolveRoadmap,
  resolveStatus,
  resolveTeam,
  teamChoices,
} from '../domain/mcp-resolve';
import {
  McpAddBacklogItemAttachmentDto,
  McpAddBacklogItemCommentDto,
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateDocPageDto,
  McpCreateIssueDto,
  McpGetBacklogItemDto,
  McpGetIssueDto,
  McpListDocsDto,
  McpSearchIssuesDto,
  McpUpdateBacklogItemStatusDto,
} from '../dtos/mcp.dtos';
import {
  McpAttachmentResponseDto,
  McpBacklogItemResponseDto,
  McpCommentResponseDto,
  McpContextResponseDto,
  McpDocPageResponseDto,
  McpDocResponseDto,
  McpDocSummaryResponseDto,
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

/** Same reasoning for testing projects — a workspace has a handful. */
const ALL_PROJECTS = { page: 1, limit: 100, archived: false } as QueryProjectDto;

/**
 * How every doc read through MCP asks — as nobody.
 *
 * The same stance `search_issues` takes when it passes an empty `userId` to keep
 * personal tasks out: a key is not a person. It acts *as* its owner for
 * attribution, which is a statement about who wrote something, not a reason to
 * hand a string living in a config file the one shelf in the workspace that was
 * marked as nobody else's business.
 */
const MCP_VIEWER: DocViewer = { userId: '', isAdmin: false };

/**
 * Private docs are out, the key owner's own included. Checked here rather than
 * left to the viewer filter alone, because that filter matches `createdBy` — and
 * a doc written before authors were recorded has an empty one, which an empty
 * viewer id would match.
 */
const isWorkspaceDoc = (doc: DocEntity): boolean => !doc.isPrivate;

/** Docs to name back when one couldn't be resolved. Capped: a workspace can hold
 *  hundreds, and a failure message is guidance, not an inventory. */
function unknownDoc(ref: string, docs: DocEntity[]): string {
  const shown = docs.slice(0, 15).map((d) => d.title);
  const rest = docs.length - shown.length;
  return (
    `Unknown doc "${ref}". Available: ${shown.join(', ') || '(none yet)'}` +
    `${rest > 0 ? `, and ${rest} more — list_docs names them all` : ''}. ` +
    `Private docs are not visible through MCP.`
  );
}

/** The doc's own pages, each named the way `parentPage` will take it back — a
 *  doc with two "Notes" pages has to be answerable, and the key is the answer. */
function unknownPage(ref: string, doc: DocEntity, pages: DocPageEntity[]): string {
  const choices = pages.map((p) => `${p.title} (${pageKey(p.id.toString())})`);
  return (
    `Unknown page "${ref}" in "${doc.title}". Available: ${choices.join(', ') || '(none)'}. ` +
    `Omit parentPage to add the page at the top level.`
  );
}

@Injectable()
export class GetMcpContextUseCase implements IUsecaseExecute<
  { actor: McpActor },
  Result<McpContextResponseDto>
> {
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly getTemplates: GetRoadmapTemplatesUseCase,
    private readonly getProjects: GetProjectsUseCase,
    private readonly getProjectStats: GetProjectStatsUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({ actor }: { actor: McpActor }): Promise<Result<McpContextResponseDto>> {
    const [teams, roadmaps, templates, projects, people, owner] = await Promise.all([
      this.getTeams.execute({ tenantId: actor.tenantId }),
      this.getRoadmaps.execute({ tenantId: actor.tenantId }),
      this.getTemplates.execute({ tenantId: actor.tenantId }),
      this.getProjects.execute({ tenantId: actor.tenantId, query: ALL_PROJECTS }),
      this.users.findByTenant(actor.tenantId, ALL_USERS),
      this.users.findById(actor.userId),
    ]);

    // One batched rollup rather than a report query per project — this list is
    // read before every first write, so it stays cheap.
    const projectList = projects.getValue().data;
    const stats = (
      await this.getProjectStats.execute({
        tenantId: actor.tenantId,
        projectIds: projectList.map((p) => p.id.toString()),
      })
    ).getValue();
    const featureCounts = new Map(stats.map((s) => [s.projectId, s.total]));

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
        columns: columnsOf(r, templates.getValue()),
        itemCount: r.items.length,
      })),
      projects: projectList.map((p) => ({
        id: p.id.toString(),
        title: p.title,
        featureCount: featureCounts.get(p.id.toString()) ?? 0,
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
export class McpCreateIssueUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpCreateIssueDto },
  Result<McpIssueResponseDto>
> {
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
export class McpCreateBacklogItemUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpCreateBacklogItemDto },
  Result<McpBacklogItemResponseDto>
> {
  constructor(
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly getTemplates: GetRoadmapTemplatesUseCase,
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

    const templates = (await this.getTemplates.execute({ tenantId: actor.tenantId })).getValue();
    const columns = columnsOf(roadmap, templates);
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

    return Result.ok(toBacklogItemResponse(item, roadmapId, roadmap.title));
  }
}

@Injectable()
export class McpCreateDocUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpCreateDocDto },
  Result<McpDocResponseDto>
> {
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
        // The actor wrote this doc two statements ago, so it's theirs to fill in.
        // `isAdmin: false` on purpose — an API key shouldn't inherit admin reach
        // over *other* people's docs just because the tool needs to write its own.
        viewer: { userId: actor.userId, isAdmin: false },
        author,
        dto: { content } as UpdateDocPageDto,
      });
      if (written.isFailure) return Result.fail(written.error as string);
    }

    const link = docPageLink(doc.ref || docId, pageId);
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
      entityRef: doc.ref,
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

/**
 * The docs shelf — and, when one doc is named, what is already written in it.
 *
 * `list_workspace` names teams, roadmaps and projects because those are the
 * places a *new* record goes. Docs aren't like that: a doc is somewhere writing
 * already lives, and the useful question is which one, and where in it. So they
 * get a tool of their own rather than a fourth list nobody reads.
 */
@Injectable()
export class McpListDocsUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpListDocsDto },
  Result<McpDocSummaryResponseDto[]>
> {
  constructor(
    private readonly getDocs: GetDocsUseCase,
    private readonly getDoc: GetDocUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListDocsDto;
  }): Promise<Result<McpDocSummaryResponseDto[]>> {
    const rows = (
      await this.getDocs.execute({ tenantId: actor.tenantId, viewer: MCP_VIEWER })
    ).getValue();
    const visible = rows.filter(({ doc }) => isWorkspaceDoc(doc));

    // A doc named: this is the "what's in it?" call, so answer with the tree.
    if (dto.doc) {
      const doc = resolveDoc(
        visible.map((r) => r.doc),
        dto.doc,
      );
      if (!doc) {
        return Result.fail(
          unknownDoc(
            dto.doc,
            visible.map((r) => r.doc),
          ),
        );
      }
      const found = await this.getDoc.execute({
        id: doc.id.toString(),
        tenantId: actor.tenantId,
        viewer: MCP_VIEWER,
      });
      if (found.isFailure) return Result.fail(found.error as string);
      const { pages } = found.getValue();
      return Result.ok([toDocSummaryResponse(doc, pages.length, pages)]);
    }

    const wanted = (dto.search ?? '').trim().toLowerCase();
    const matched = wanted
      ? visible.filter(
          ({ doc }) =>
            doc.title.toLowerCase().includes(wanted) ||
            doc.ref.toLowerCase().includes(wanted) ||
            doc.tags.some((tag) => tag.toLowerCase().includes(wanted)),
        )
      : visible;

    // Already sorted by last activity, so a cap keeps the docs somebody touched
    // this week and drops the ones nobody has opened in a year.
    return Result.ok(
      matched
        .slice(0, dto.limit ?? 30)
        .map(({ doc, pageCount }) => toDocSummaryResponse(doc, pageCount)),
    );
  }
}

/**
 * Write a page into a doc that already exists.
 *
 * `create_doc` fills the one page a new doc is born with; everything after that
 * used to mean a second doc. The page is created with its body in place rather
 * than created empty and then written to, which also keeps it clear of the
 * collaborative editor: a page that has never been opened has no live session to
 * argue with, and the room seeds itself from this HTML the first time somebody
 * opens it.
 */
@Injectable()
export class McpCreateDocPageUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpCreateDocPageDto },
  Result<McpDocPageResponseDto>
> {
  constructor(
    private readonly getDocs: GetDocsUseCase,
    private readonly getDoc: GetDocUseCase,
    private readonly createPage: CreateDocPageUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpCreateDocPageDto;
  }): Promise<Result<McpDocPageResponseDto>> {
    const docs = (await this.getDocs.execute({ tenantId: actor.tenantId, viewer: MCP_VIEWER }))
      .getValue()
      .map((r) => r.doc)
      .filter(isWorkspaceDoc);

    const doc = resolveDoc(docs, dto.doc);
    if (!doc) return Result.fail(unknownDoc(dto.doc, docs));
    const docId = doc.id.toString();

    const found = await this.getDoc.execute({
      id: docId,
      tenantId: actor.tenantId,
      viewer: MCP_VIEWER,
    });
    if (found.isFailure) return Result.fail(found.error as string);
    const existing = found.getValue().pages;

    // A parent named by title: an unknown one lists the doc's real pages rather
    // than quietly putting a sub-page at the top level, where nobody looks for it.
    let parent: DocPageEntity | null = null;
    if (dto.parentPage) {
      parent = resolveDocPage(existing, dto.parentPage);
      if (!parent) return Result.fail(unknownPage(dto.parentPage, doc, existing));
    }

    const actorUser = await this.users.findById(actor.userId);
    const author = { userId: actor.userId, name: actorUser?.name ?? actor.keyName };
    // The page prints its own title above the body, same as the first page does.
    const content = stripEchoedTitle(docBodyToHtml(dto.content), dto.title);

    const created = await this.createPage.execute({
      docId,
      tenantId: actor.tenantId,
      author,
      viewer: MCP_VIEWER,
      dto: {
        title: dto.title,
        parentId: parent?.id.toString(),
        content,
      } as CreateDocPageDto,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const page = created.getValue();

    const depth = parent ? depthOf(existing, parent) + 1 : 0;
    const response = toDocPageResponse(page, doc, depth, parent?.title ?? '');

    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: author.name,
      clientName: actor.clientName,
      tool: McpTool.CREATE_DOC_PAGE,
      entity: McpEntity.DOC,
      entityId: page.id.toString(),
      entityRef: doc.ref,
      // The page is what was written; the doc is the context it landed in — the
      // same shape an issue row takes, where the team is the context.
      entityTitle: page.title,
      contextLabel: doc.title,
      link: response.link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok(response);
  }
}

@Injectable()
export class McpSearchIssuesUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpSearchIssuesDto },
  Result<McpIssueResponseDto[]>
> {
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

/**
 * One issue, in full.
 *
 * `search_issues` answers "which one?" and deliberately stays terse; this
 * answers "what does it say?" — the description is the reason to call it, and
 * it is the one field search omits.
 */
@Injectable()
export class McpGetIssueUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpGetIssueDto },
  Result<McpIssueResponseDto>
> {
  constructor(
    private readonly getTeams: GetTeamsUseCase,
    private readonly getIssue: GetIssueUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpGetIssueDto;
  }): Promise<Result<McpIssueResponseDto>> {
    // requesterId '' / isAdmin false is the same stance `search_issues` takes:
    // a key is not a person, so a personal task stays invisible to it. The
    // use-case answers "not found" rather than "forbidden", which is what we
    // want to pass on — a key shouldn't learn that a private ref exists.
    const found = await this.getIssue.execute({
      id: dto.ref.trim(),
      tenantId: actor.tenantId,
      requesterId: '',
      isAdmin: false,
    });
    if (found.isFailure) {
      return Result.fail(
        `No issue ${dto.ref}. Refs look like TSK-6HCUHKX or BUG-6HCUHKX — search_issues finds one by title.`,
      );
    }

    const issue = found.getValue();
    const teams = (await this.getTeams.execute({ tenantId: actor.tenantId })).getValue();
    const teamName = teams.find((t) => t.id.toString() === issue.teamId)?.name ?? '';
    return Result.ok(toIssueResponse(issue, teamName));
  }
}

/**
 * One backlog item, in full. Items live inside their roadmap aggregate rather
 * than in a collection of their own, so this scans the tenant's roadmaps — a
 * workspace has a handful, and it means a ref alone is enough to find one.
 */
@Injectable()
export class McpGetBacklogItemUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpGetBacklogItemDto },
  Result<McpBacklogItemResponseDto>
> {
  constructor(private readonly getRoadmaps: GetRoadmapsUseCase) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpGetBacklogItemDto;
  }): Promise<Result<McpBacklogItemResponseDto>> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
    const ref = dto.ref.trim();

    for (const roadmap of roadmaps) {
      const item = findRoadmapItem(roadmap.items, ref);
      if (item) return Result.ok(toBacklogItemResponse(item, roadmap.id.toString(), roadmap.title));
    }

    // A ref is exact; a title is how a person actually refers to an item, so
    // fall back to one before giving up. Exact title first, then a unique
    // partial — an ambiguous partial names its candidates instead of guessing.
    const wanted = ref.toLowerCase();
    const scan = roadmaps.flatMap((roadmap) => roadmap.items.map((item) => ({ item, roadmap })));
    const exact = scan.filter(({ item }) => item.title.trim().toLowerCase() === wanted);
    const partial = exact.length
      ? exact
      : scan.filter(({ item }) => item.title.toLowerCase().includes(wanted));

    if (partial.length === 1) {
      const { item, roadmap } = partial[0];
      return Result.ok(toBacklogItemResponse(item, roadmap.id.toString(), roadmap.title));
    }
    if (partial.length > 1) {
      return Result.fail(
        `Several backlog items match "${ref}": ${partial
          .map(({ item }) => `${item.shortId || item.id} (${item.title})`)
          .join(', ')}. Use a ref.`,
      );
    }
    return Result.fail(
      `No backlog item ${ref}. Refs look like RM-6HCUHKX; list_workspace names the roadmaps.`,
    );
  }
}

/**
 * Move a backlog item's column and/or set its status — dragging a card, or
 * marking it planned / in progress / done, without having to resend the rest
 * of the item. Delegates to `UpdateRoadmapItemUseCase`, the same atomic
 * single-item pattern `create_backlog_item` uses (see `AddRoadmapItemUseCase`),
 * rather than the bulk `PUT /roadmaps/:id/items` the board itself drives —
 * that endpoint replaces the whole array, which a caller that only knows one
 * item's new status must not have to read, patch and write back.
 */
@Injectable()
export class McpUpdateBacklogItemStatusUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpUpdateBacklogItemStatusDto },
  Result<McpBacklogItemResponseDto>
> {
  constructor(
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly getTemplates: GetRoadmapTemplatesUseCase,
    private readonly updateItem: UpdateRoadmapItemUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpUpdateBacklogItemStatusDto;
  }): Promise<Result<McpBacklogItemResponseDto>> {
    if (!dto.phase && !dto.status) {
      return Result.fail('Send a phase, a status, or both — there is nothing to change otherwise.');
    }

    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
    const ref = dto.ref.trim();

    // Same "ref, then exact title, then a unique partial" fallback
    // get_backlog_item uses — an ambiguous partial names its candidates rather
    // than guessing which item to move.
    let match: { item: RoadmapItemData; roadmap: RoadmapEntity } | undefined;
    for (const roadmap of roadmaps) {
      const item = findRoadmapItem(roadmap.items, ref);
      if (item) match = { item, roadmap };
    }
    if (!match) {
      const wanted = ref.toLowerCase();
      const scan = roadmaps.flatMap((roadmap) => roadmap.items.map((item) => ({ item, roadmap })));
      const exact = scan.filter(({ item }) => item.title.trim().toLowerCase() === wanted);
      const partial = exact.length
        ? exact
        : scan.filter(({ item }) => item.title.toLowerCase().includes(wanted));
      if (partial.length === 1) {
        match = partial[0];
      } else if (partial.length > 1) {
        return Result.fail(
          `Several backlog items match "${ref}": ${partial
            .map(({ item }) => `${item.shortId || item.id} (${item.title})`)
            .join(', ')}. Use a ref.`,
        );
      }
    }
    if (!match) {
      return Result.fail(
        `No backlog item ${ref}. Refs look like RM-6HCUHKX; list_workspace names the roadmaps.`,
      );
    }
    const { item, roadmap } = match;

    let phase: string | undefined;
    if (dto.phase) {
      const templates = (await this.getTemplates.execute({ tenantId: actor.tenantId })).getValue();
      const columns = columnsOf(roadmap, templates);
      const resolved = resolvePhase(columns, dto.phase);
      if (!resolved) {
        return Result.fail(didYouMean('column', dto.phase, columns.map((c) => c.label)));
      }
      phase = resolved;
    }

    const updated = await this.updateItem.execute({
      id: roadmap.id.toString(),
      itemId: item.id,
      tenantId: actor.tenantId,
      phase,
      status: dto.status,
    });
    if (updated.isFailure) return Result.fail(updated.error as string);

    const { item: next } = updated.getValue();
    const roadmapId = roadmap.id.toString();
    const link = backlogItemLink(roadmapId, next.shortId || next.id);

    const actorUser = await this.users.findById(actor.userId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.UPDATE_BACKLOG_ITEM_STATUS,
      entity: McpEntity.BACKLOG_ITEM,
      entityId: next.id,
      entityRef: next.shortId,
      entityTitle: next.title,
      contextLabel: roadmap.title,
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok(toBacklogItemResponse(next, roadmapId, roadmap.title));
  }
}

/**
 * Post a comment on a backlog item's thread — the same thread its page shows
 * in the app, so a note left here reaches anyone already watching the item.
 * Delegates to `CreateRoadmapItemCommentUseCase`, the same use-case the app's
 * own comment box calls. Mentions resolve like `create_issue`'s assignee
 * does: one name, or several comma-separated, each looked up on its own so an
 * unknown one fails with the real choices instead of silently dropping the
 * ping.
 */
@Injectable()
export class McpAddBacklogItemCommentUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpAddBacklogItemCommentDto },
  Result<McpCommentResponseDto>
> {
  constructor(
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly createComment: CreateRoadmapItemCommentUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpAddBacklogItemCommentDto;
  }): Promise<Result<McpCommentResponseDto>> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
    const ref = dto.ref.trim();

    // Same "ref, then exact title, then a unique partial" fallback
    // get_backlog_item uses — an ambiguous partial names its candidates rather
    // than guessing which item to comment on.
    let match: { item: RoadmapItemData; roadmap: RoadmapEntity } | undefined;
    for (const roadmap of roadmaps) {
      const item = findRoadmapItem(roadmap.items, ref);
      if (item) match = { item, roadmap };
    }
    if (!match) {
      const wanted = ref.toLowerCase();
      const scan = roadmaps.flatMap((roadmap) => roadmap.items.map((item) => ({ item, roadmap })));
      const exact = scan.filter(({ item }) => item.title.trim().toLowerCase() === wanted);
      const partial = exact.length
        ? exact
        : scan.filter(({ item }) => item.title.toLowerCase().includes(wanted));
      if (partial.length === 1) {
        match = partial[0];
      } else if (partial.length > 1) {
        return Result.fail(
          `Several backlog items match "${ref}": ${partial
            .map(({ item }) => `${item.shortId || item.id} (${item.title})`)
            .join(', ')}. Use a ref.`,
        );
      }
    }
    if (!match) {
      return Result.fail(
        `No backlog item ${ref}. Refs look like RM-6HCUHKX; list_workspace names the roadmaps.`,
      );
    }
    const { item, roadmap } = match;

    // One name, or several comma-separated — same parsing create_issue's
    // assignee uses, each resolved on its own so an unknown one names the
    // real people instead of quietly leaving the mention out.
    const mentionIds: string[] = [];
    const mentionNames: string[] = [];
    const wantedNames = (dto.mentions ?? '')
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
              'mention',
              name,
              people.data.map((u) => u.name),
            ),
          );
        }
        mentionIds.push(person.id.toString());
        mentionNames.push(person.name);
      }
    }

    const actorUser = await this.users.findById(actor.userId);
    const created = await this.createComment.execute({
      tenantId: actor.tenantId,
      roadmapId: roadmap.id.toString(),
      itemId: item.id,
      authorId: actor.userId,
      authorName: actorUser?.name ?? actor.keyName,
      dto: { body: dto.body, mentions: mentionIds.length ? mentionIds : undefined },
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    const roadmapId = roadmap.id.toString();
    const link = backlogItemLink(roadmapId, item.shortId || item.id);

    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.ADD_BACKLOG_ITEM_COMMENT,
      entity: McpEntity.BACKLOG_ITEM,
      entityId: comment.id.toString(),
      entityRef: item.shortId,
      // The comment is what was written; the item is the context it landed on
      // — the same shape create_doc_page's event takes, where the doc is context.
      entityTitle: plainSnippet(comment.body, 80),
      contextLabel: item.title,
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({
      id: comment.id.toString(),
      backlogItemRef: item.shortId || item.id,
      backlogItemTitle: item.title,
      authorId: comment.authorId,
      authorName: comment.authorName,
      body: comment.body,
      mentionNames,
      createdAt: comment.createdAt,
      link,
    });
  }
}

/** Hard ceiling on the base64 payload MCP will decode, well under the app's
 *  own per-kind upload caps — a JSON-RPC call is for a spec or a screenshot,
 *  not a video; anything bigger goes through the app itself. */
const MCP_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

@Injectable()
export class McpAddBacklogItemAttachmentUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpAddBacklogItemAttachmentDto },
  Result<McpAttachmentResponseDto>
> {
  constructor(
    private readonly getRoadmaps: GetRoadmapsUseCase,
    private readonly uploadMedia: UploadMediaUseCase,
    private readonly addAttachment: AddRoadmapItemAttachmentUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpAddBacklogItemAttachmentDto;
  }): Promise<Result<McpAttachmentResponseDto>> {
    const roadmaps = (await this.getRoadmaps.execute({ tenantId: actor.tenantId })).getValue();
    const ref = dto.ref.trim();

    // Same "ref, then exact title, then a unique partial" fallback
    // add_backlog_item_comment uses — an ambiguous partial names its
    // candidates rather than guessing which item to attach to.
    let match: { item: RoadmapItemData; roadmap: RoadmapEntity } | undefined;
    for (const roadmap of roadmaps) {
      const item = findRoadmapItem(roadmap.items, ref);
      if (item) match = { item, roadmap };
    }
    if (!match) {
      const wanted = ref.toLowerCase();
      const scan = roadmaps.flatMap((roadmap) => roadmap.items.map((item) => ({ item, roadmap })));
      const exact = scan.filter(({ item }) => item.title.trim().toLowerCase() === wanted);
      const partial = exact.length
        ? exact
        : scan.filter(({ item }) => item.title.toLowerCase().includes(wanted));
      if (partial.length === 1) {
        match = partial[0];
      } else if (partial.length > 1) {
        return Result.fail(
          `Several backlog items match "${ref}": ${partial
            .map(({ item }) => `${item.shortId || item.id} (${item.title})`)
            .join(', ')}. Use a ref.`,
        );
      }
    }
    if (!match) {
      return Result.fail(
        `No backlog item ${ref}. Refs look like RM-6HCUHKX; list_workspace names the roadmaps.`,
      );
    }
    const { item, roadmap } = match;
    if ((item.attachments?.length ?? 0) >= MAX_ATTACHMENTS) {
      return Result.fail(
        `${item.shortId || item.id} already has ${MAX_ATTACHMENTS} attachments, the most one ` +
          `can hold — remove one from the app before adding another.`,
      );
    }

    // A data: URI is accepted as a convenience — strip it and borrow its mime
    // type when the caller didn't send one of its own.
    let raw = dto.contentBase64.trim();
    let contentType = dto.contentType?.trim() ?? '';
    const dataUri = raw.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
    if (dataUri) {
      if (dataUri[1] && !contentType) contentType = dataUri[1];
      raw = dataUri[3];
    }
    raw = raw.replace(/\s+/g, '');
    if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
      return Result.fail('contentBase64 is not valid base64.');
    }

    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length === 0) return Result.fail('The decoded file is empty.');
    if (buffer.length > MCP_ATTACHMENT_MAX_BYTES) {
      return Result.fail(
        `That file is ${Math.ceil(buffer.length / (1024 * 1024))}MB decoded — MCP attaches up ` +
          `to ${MCP_ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB. Attach anything bigger from the app.`,
      );
    }

    let uploaded: { url: string; name: string; contentType: string; size: number };
    try {
      uploaded = await this.uploadMedia.execute(actor.tenantId, {
        buffer,
        contentType: contentType || 'application/octet-stream',
        originalName: dto.fileName.trim(),
        size: buffer.length,
      });
    } catch (err) {
      return Result.fail(err instanceof Error ? err.message : 'Could not store that file.');
    }

    const added = await this.addAttachment.execute({
      id: roadmap.id.toString(),
      itemId: item.id,
      tenantId: actor.tenantId,
      file: uploaded,
    });
    if (added.isFailure) return Result.fail(added.error as string);
    const { item: next } = added.getValue();

    const actorUser = await this.users.findById(actor.userId);
    const roadmapId = roadmap.id.toString();
    const link = backlogItemLink(roadmapId, next.shortId || next.id);

    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.ADD_BACKLOG_ITEM_ATTACHMENT,
      entity: McpEntity.BACKLOG_ITEM,
      entityId: next.id,
      entityRef: next.shortId,
      // The file is what was added; the item is the context it landed on —
      // same shape add_backlog_item_comment's event takes.
      entityTitle: uploaded.name,
      contextLabel: next.title,
      link,
    });
    if (event.isSuccess) await this.events.append(event.getValue());

    return Result.ok({
      backlogItemRef: next.shortId || next.id,
      backlogItemTitle: next.title,
      name: uploaded.name,
      contentType: uploaded.contentType,
      size: uploaded.size,
      url: uploaded.url,
      link,
    });
  }
}

@Injectable()
export class GetMcpEventsUseCase implements IUsecaseExecute<
  { tenantId: string; query: PaginationDto },
  Result<McpEventPaginationResponse>
> {
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

/**
 * A doc's pages in reading order — a parent, then everything nested under it —
 * each with the depth it sits at, because indentation is the only way a flat
 * list shows a tree. Pages arrive sorted by `order` and grouping preserves that,
 * so the result is the rail as the app draws it. A page whose parent has gone
 * missing is treated as top level rather than dropped: an orphan is still a page
 * somebody wrote, and a tool that silently omits one invites a second copy.
 */
function pagesInOrder(pages: DocPageEntity[]): { page: DocPageEntity; depth: number }[] {
  const ids = new Set(pages.map((p) => p.id.toString()));
  const byParent = new Map<string, DocPageEntity[]>();
  for (const page of pages) {
    const parentId = page.parentId && ids.has(page.parentId) ? page.parentId : '';
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), page]);
  }

  const out: { page: DocPageEntity; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string, depth: number): void => {
    for (const page of byParent.get(parentId) ?? []) {
      const id = page.id.toString();
      // Cycles are forbidden when pages are moved, so this only ever guards
      // against old data — but a read that can loop forever is not worth having.
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ page, depth });
      walk(id, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

/** How deep one page sits. Walks up, because the caller already has the page. */
function depthOf(pages: DocPageEntity[], page: DocPageEntity): number {
  const byId = new Map(pages.map((p) => [p.id.toString(), p]));
  let depth = 0;
  let cursor = page.parentId;
  const seen = new Set<string>();
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = (byId.get(cursor) as DocPageEntity).parentId;
  }
  return depth;
}

/** One page shape for every MCP reply — listed and just-created read the same. */
function toDocPageResponse(
  page: DocPageEntity,
  doc: DocEntity,
  depth: number,
  parentTitle: string,
): McpDocPageResponseDto {
  const docId = doc.id.toString();
  return {
    id: page.id.toString(),
    key: pageKey(page.id.toString()),
    docId,
    docRef: doc.ref,
    docTitle: doc.title,
    title: page.title,
    parentId: page.parentId,
    parentTitle,
    depth,
    hasContent: !!page.content.trim(),
    updatedByName: page.updatedByName,
    updatedAt: page.updatedAt,
    link: docPageLink(doc.ref || docId, page.id.toString()),
  };
}

/** One doc shape for every MCP reply. `pages` is only filled when the caller
 *  asked about a single doc — see `McpListDocsUseCase`. */
function toDocSummaryResponse(
  doc: DocEntity,
  pageCount: number,
  pages?: DocPageEntity[],
): McpDocSummaryResponseDto {
  const docId = doc.id.toString();
  const titles = new Map((pages ?? []).map((p) => [p.id.toString(), p.title]));
  return {
    id: docId,
    ref: doc.ref,
    title: doc.title,
    tags: doc.tags,
    pageCount,
    createdByName: doc.createdByName,
    updatedAt: doc.updatedAt,
    link: docLink(doc.ref || docId),
    pages: pages
      ? pagesInOrder(pages).map(({ page, depth }) =>
          toDocPageResponse(page, doc, depth, titles.get(page.parentId) ?? ''),
        )
      : [],
  };
}

/** One backlog-item shape for every MCP reply — create and read the same. */
function toBacklogItemResponse(
  item: RoadmapItemData,
  roadmapId: string,
  roadmapTitle: string,
): McpBacklogItemResponseDto {
  return {
    id: item.id,
    shortId: item.shortId ?? '',
    roadmapId,
    roadmapTitle,
    title: item.title,
    // Both are typed as required and both can be absent on a row written before
    // they existed. A read tool that prints "column: undefined" is worse than
    // one that says nothing, so an old item reports what it has and no more.
    phase: item.phase ?? '',
    status: item.status ?? '',
    riceScore: riceScore(item),
    description: htmlToReadableText(item.description),
    difficulty: item.difficulty ?? '',
    progress: item.progress ?? 0,
    startDate: item.startDate ?? '',
    endDate: item.endDate ?? '',
    link: backlogItemLink(roadmapId, item.shortId || item.id),
  };
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
    description: htmlToReadableText(issue.description),
    link: issueLink(issue.shortId || issue.id.toString()),
    updatedAt: issue.updatedAt,
  };
}
