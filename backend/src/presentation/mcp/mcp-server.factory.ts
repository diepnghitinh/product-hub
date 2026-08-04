import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Result } from '@shared/logic/result';
import { BugSeverity, IssueKind } from '@application/issues/domain/enums/issue.enums';
import {
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@application/roadmaps/domain/enums/roadmap.enums';
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
} from '@application/mcp/dtos/mcp.dtos';
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
} from '@application/mcp/dtos/mcp.response.dto';
import {
  GetMcpContextUseCase,
  McpActor,
  McpAddCommentUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpDeleteCommentUseCase,
  McpDeleteIssueUseCase,
  McpGetIssueUseCase,
  McpLinkIssuesUseCase,
  McpListBacklogItemsUseCase,
  McpListCommentsUseCase,
  McpListLinksUseCase,
  McpSearchIssuesUseCase,
  McpSetStatusUseCase,
  McpUnlinkIssuesUseCase,
  McpUpdateCommentUseCase,
  McpUpdateDocUseCase,
  McpUpdateIssueUseCase,
} from '@application/mcp/use-cases';
import { assertCanDelete, assertCanWrite } from './mcp-scope';

/** Version advertised to the client during the MCP handshake. */
const SERVER_VERSION = '1.0.0';

/**
 * Whoever the session is currently acting for. Held by reference rather than
 * captured: a session outlives the request that opened it, so the tools read the
 * actor at *call* time — the key it was last seen with, not the first one.
 */
export interface McpActorHolder {
  actor: McpActor;
}

/** An MCP tool reply. Text only — these tools answer in prose, not structures. */
interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const text = (body: string): ToolResult => ({ content: [{ type: 'text', text: body }] });
const failure = (body: string): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: body }],
});

/** Runs a write call only if the key's scope permits it, so the gate reads as a
 *  single wrap at each write tool rather than a repeated branch. */
function gated<T>(actor: McpActor, call: () => Promise<Result<T>>): Promise<Result<T>> {
  const gate = assertCanWrite(actor);
  if (gate.isFailure) return Promise.resolve(Result.fail<T>(gate.error as string));
  return call();
}

/** As {@link gated}, but for a destructive tool — a delete needs the delete scope,
 *  a strictly higher bar than write. */
function gatedDelete<T>(actor: McpActor, call: () => Promise<Result<T>>): Promise<Result<T>> {
  const gate = assertCanDelete(actor);
  if (gate.isFailure) return Promise.resolve(Result.fail<T>(gate.error as string));
  return call();
}

/** The error-handling wrapper each `register*` is handed. */
type Run = <T>(
  call: (actor: McpActor) => Promise<Result<T>>,
  describe: (value: T) => string,
) => Promise<ToolResult>;

/**
 * Builds the MCP server that `/v1/mcp` speaks. One instance per session, because
 * an `McpServer` is bound to a single transport.
 *
 * The tools are a thin surface over the same use-cases the web app calls: name
 * resolution ("QC", "Next", "Aaron"), defaults and validation all live in
 * `application/mcp`, so a tool call and a click produce identical records. A name
 * that cannot be resolved comes back as an error *listing the valid choices*,
 * which is what lets an assistant correct itself instead of guessing.
 */
@Injectable()
export class McpServerFactory {
  /** Workspace base URL, so a tool reply carries a link the user can click. */
  private readonly appUrl: string;

  constructor(
    private readonly getContext: GetMcpContextUseCase,
    private readonly createIssue: McpCreateIssueUseCase,
    private readonly getIssue: McpGetIssueUseCase,
    private readonly updateIssue: McpUpdateIssueUseCase,
    private readonly setStatus: McpSetStatusUseCase,
    private readonly deleteIssue: McpDeleteIssueUseCase,
    private readonly listComments: McpListCommentsUseCase,
    private readonly addComment: McpAddCommentUseCase,
    private readonly updateComment: McpUpdateCommentUseCase,
    private readonly deleteComment: McpDeleteCommentUseCase,
    private readonly createBacklogItem: McpCreateBacklogItemUseCase,
    private readonly createDoc: McpCreateDocUseCase,
    private readonly updateDoc: McpUpdateDocUseCase,
    private readonly searchIssues: McpSearchIssuesUseCase,
    private readonly listBacklogItems: McpListBacklogItemsUseCase,
    private readonly linkIssues: McpLinkIssuesUseCase,
    private readonly listLinks: McpListLinksUseCase,
    private readonly unlinkIssues: McpUnlinkIssuesUseCase,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_BASE_URL') ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  create(holder: McpActorHolder): McpServer {
    const server = new McpServer({ name: 'product-os', version: SERVER_VERSION });

    // The client names itself in the handshake, which is more trustworthy than
    // the `x-mcp-client` header the actor was built from — prefer it once it is
    // there, so the workspace history reads "claude-code/2.1.0".
    const actorOf = (): McpActor => {
      const info = server.server.getClientVersion();
      if (!info?.name) return holder.actor;
      return { ...holder.actor, clientName: `${info.name}/${info.version || '0'}`.slice(0, 80) };
    };

    /** Every tool funnels through here, so a bad name reads as guidance. */
    const run: Run = async (call, describe) => {
      try {
        const result = await call(actorOf());
        if (result.isFailure) return failure(result.error as string);
        return text(describe(result.getValue()));
      } catch (err) {
        return failure(`Product OS could not complete that: ${(err as Error).message}`);
      }
    };

    this.registerListWorkspace(server, run);
    this.registerSearchIssues(server, run);
    this.registerGetIssue(server, run);
    this.registerCreateIssue(server, run);
    this.registerUpdateIssue(server, run);
    this.registerSetStatus(server, run);
    this.registerDeleteIssue(server, run);
    this.registerListComments(server, run);
    this.registerAddComment(server, run);
    this.registerUpdateComment(server, run);
    this.registerDeleteComment(server, run);
    this.registerCreateBacklogItem(server, run);
    this.registerListBacklogItems(server, run);
    this.registerCreateDoc(server, run);
    this.registerUpdateDoc(server, run);
    this.registerLinkIssues(server, run);
    this.registerListLinks(server, run);
    this.registerUnlinkIssues(server, run);

    return server;
  }

  /* ── Tools ──────────────────────────────────────────────────────────────── */

  private registerListWorkspace(server: McpServer, run: Run): void {
    registerTool(
      server,
      'list_workspace',
      {
        title: 'List the Product OS workspace',
        description:
          'Teams (with the exact status keys their boards accept), roadmaps (with their column keys) ' +
          'and the people who can be assigned. Call this before creating anything so you use real ' +
          'names — bugs go to bug teams, tasks to task teams.',
        annotations: { readOnlyHint: true },
      },
      () =>
        run<McpContextResponseDto>(
          (actor) => this.getContext.execute({ actor }),
          (ctx) => this.describeWorkspace(ctx),
        ),
    );
  }

  private registerSearchIssues(server: McpServer, run: Run): void {
    registerTool<McpSearchIssuesDto>(
      server,
      'search_issues',
      {
        title: 'Search issues',
        description:
          'Find existing tasks and bugs by title or reference. Use it before creating to avoid filing ' +
          'a duplicate, or to quote an issue back to the user. Pass `parent` to list an issue’s ' +
          'subtasks, or `backlog` to list every ticket filed under a roadmap backlog item.',
        inputSchema: {
          search: z.string().optional().describe('Free text matched against title and reference'),
          kind: z.nativeEnum(IssueKind).optional(),
          team: z.string().optional().describe('Team name or id'),
          parent: z
            .string()
            .optional()
            .describe('Parent issue ref (TSK-7) or id — returns that issue’s subtasks'),
          backlog: z
            .string()
            .optional()
            .describe('Backlog item ref (RM-6HCUHKX) or id — returns the tickets linked to it'),
          limit: z.number().int().min(1).max(50).optional().describe('Default 20'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpIssueResponseDto[]>(
          (actor) => this.searchIssues.execute({ actor, dto }),
          (issues) =>
            issues.length
              ? `${issues.length} issue(s):\n\n${issues.map((i) => this.describeIssue(i)).join('\n\n')}`
              : 'No matching issues.',
        ),
    );
  }

  private registerCreateIssue(server: McpServer, run: Run): void {
    registerTool<McpCreateIssueDto>(
      server,
      'create_issue',
      {
        title: 'Create a task or bug',
        description:
          'File a task or bug on a team board in Product OS. Team, status and assignee accept plain ' +
          'names ("QC", "In progress", "Aaron") — an unknown one comes back with the valid choices ' +
          'instead of guessing. Omit `team` to use the workspace default for the kind. Pass `parent` ' +
          'to create this as a subtask under an existing issue.',
        inputSchema: {
          kind: z.nativeEnum(IssueKind).describe('task = work to do, bug = a defect'),
          title: z.string().min(1),
          description: z.string().optional().describe('Plain text or HTML'),
          team: z.string().optional().describe('Team name or id — must own this kind of issue'),
          status: z
            .string()
            .optional()
            .describe("Status key or column label; defaults to the board's first column"),
          assignee: z
            .string()
            .optional()
            .describe('Person name or email; several, comma-separated, to share the issue'),
          severity: z.nativeEnum(BugSeverity).optional().describe('Bugs only'),
          estimate: z.number().min(0).optional().describe('Story points — tasks only'),
          startDate: z.string().optional().describe('YYYY-MM-DD'),
          endDate: z.string().optional().describe('YYYY-MM-DD'),
          backlogItemId: z
            .string()
            .optional()
            .describe(
              'Roadmap backlog item ref (RM-6HCUHKX) or id to file this under, as delivery work for it',
            ),
          parent: z
            .string()
            .optional()
            .describe('Parent issue ref (TSK-7) or id — creates this as a subtask under it'),
        },
      },
      (dto) =>
        run<McpIssueResponseDto>(
          (actor) => gated(actor, () => this.createIssue.execute({ actor, dto })),
          (issue) => `Created ${issue.shortId} — ${issue.title}\n\n${this.describeIssue(issue)}`,
        ),
    );
  }

  private registerGetIssue(server: McpServer, run: Run): void {
    registerTool<McpGetIssueDto>(
      server,
      'get_issue',
      {
        title: 'Read one issue in full',
        description:
          'Read a single task or bug by its reference ("TSK-7", "BUG-12") or id — its status, team, ' +
          'assignees, description, labels, its subtasks and its most recent comments (the total is ' +
          'commentCount; use list_comments for the whole thread). Call this before update_issue or ' +
          'delete_issue so you edit from the current state.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpIssueDetailResponseDto>(
          (actor) => this.getIssue.execute({ actor, dto }),
          (issue) => this.describeIssueDetail(issue),
        ),
    );
  }

  private registerUpdateIssue(server: McpServer, run: Run): void {
    registerTool<McpUpdateIssueDto>(
      server,
      'update_issue',
      {
        title: 'Update a task or bug',
        description:
          'Patch an existing task or bug — only the fields you pass change. `assignee` and `labels` ' +
          'REPLACE the whole set, they do not add to it: to keep the current people/labels, include ' +
          'them; pass "" to `assignee` (or [] to `labels`) to clear them. To MOVE an issue between ' +
          'status columns use set_issue_status, not this tool — there is no `status` here and no way ' +
          'to change the team. `parent` nests the issue as a subtask ("" detaches); `backlogItem` ' +
          'links it to a roadmap item ("" unlinks). Names and refs resolve like create_issue.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
          title: z.string().optional(),
          description: z.string().optional().describe('Plain text or HTML — replaces the description'),
          assignee: z
            .string()
            .optional()
            .describe('Names/emails, comma-separated — REPLACES the whole set; "" unassigns everyone'),
          cycleId: z.string().optional().describe("Team cycle to commit to; '' leaves the cycle"),
          estimate: z.number().min(0).optional().describe('Story points — tasks only'),
          severity: z.nativeEnum(BugSeverity).optional().describe('Bugs only'),
          startDate: z.string().optional().describe("YYYY-MM-DD; '' clears"),
          endDate: z.string().optional().describe("YYYY-MM-DD; '' clears"),
          parent: z.string().optional().describe("Parent issue ref/id to nest under; '' detaches"),
          backlogItem: z.string().optional().describe("Backlog item ref/id to link; '' unlinks"),
          labels: z
            .array(z.string())
            .optional()
            .describe('Team label keys/names — REPLACES the whole set ([] clears)'),
        },
      },
      (dto) =>
        run<McpIssueResponseDto>(
          (actor) => gated(actor, () => this.updateIssue.execute({ actor, dto })),
          (issue) => `Updated ${issue.shortId} — ${issue.title}\n\n${this.describeIssue(issue)}`,
        ),
    );
  }

  private registerSetStatus(server: McpServer, run: Run): void {
    registerTool<McpSetStatusDto>(
      server,
      'set_issue_status',
      {
        title: 'Move an issue to another status',
        description:
          'Move a task or bug into a different status column on its board — the Kanban drag. `status` ' +
          'accepts a column key or its label ("In progress", "Done") and is validated against the ' +
          "issue's own team board; an unknown one comes back with the valid columns. This is the only " +
          'way to change status — update_issue does not touch it.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
          status: z.string().describe("Status key or column label on the issue's board"),
        },
      },
      (dto) =>
        run<McpIssueResponseDto>(
          (actor) => gated(actor, () => this.setStatus.execute({ actor, dto })),
          (issue) => `Moved ${issue.shortId} → ${issue.status}\n\n${this.describeIssue(issue)}`,
        ),
    );
  }

  private registerDeleteIssue(server: McpServer, run: Run): void {
    registerTool<McpDeleteIssueDto>(
      server,
      'delete_issue',
      {
        title: 'Delete a task or bug',
        description:
          'Permanently delete a task or bug by ref or id. This cannot be undone. It is REFUSED when ' +
          'the issue still has subtasks — the reply lists them so you can move or delete them first. ' +
          'Deleting a bug needs an admin/product key owner. Requires a key with delete access.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
        },
        annotations: { destructiveHint: true },
      },
      (dto) =>
        run<McpDeletedIssueResponseDto>(
          (actor) => gatedDelete(actor, () => this.deleteIssue.execute({ actor, dto })),
          (issue) => `Deleted ${issue.shortId || issue.id} — ${issue.title}`,
        ),
    );
  }

  private registerListComments(server: McpServer, run: Run): void {
    registerTool<McpListCommentsDto>(
      server,
      'list_comments',
      {
        title: 'List an issue’s comments',
        description:
          'Read the full comment thread on a task or bug by its ref ("TSK-7") or id. Each line shows ' +
          'the comment id (pass it to update_comment/delete_comment), the author, when it was posted ' +
          'and an excerpt; replies are shown indented under the comment they answer.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpCommentDto[]>(
          (actor) => this.listComments.execute({ actor, dto }),
          (comments) =>
            comments.length
              ? `${comments.length} comment(s):\n\n${this.describeComments(comments)}`
              : 'No comments yet.',
        ),
    );
  }

  private registerAddComment(server: McpServer, run: Run): void {
    registerTool<McpAddCommentDto>(
      server,
      'add_comment',
      {
        title: 'Comment on an issue',
        description:
          'Post a comment on a task or bug. Set `replyTo` to a comment id (from list_comments or ' +
          'get_issue) to reply — threads are one level deep, so a reply to a reply attaches to its ' +
          'root. `mentions` takes people by name or email ("Aaron", "jane@acme.co"); they are ' +
          'resolved to users and pinged, so write the @name in the body AND list them here.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
          body: z
            .string()
            .min(1)
            .describe('Comment text — Markdown, HTML or plain text. ```code``` and **bold** render.'),
          replyTo: z.string().optional().describe('Comment id to reply to'),
          mentions: z
            .array(z.string())
            .optional()
            .describe('People to notify, by name or email'),
        },
      },
      (dto) =>
        run<McpCommentResultDto>(
          (actor) => gated(actor, () => this.addComment.execute({ actor, dto })),
          (c) => `Commented on ${c.issueShortId}\n\n${this.url(c.link)}`,
        ),
    );
  }

  private registerUpdateComment(server: McpServer, run: Run): void {
    registerTool<McpUpdateCommentDto>(
      server,
      'update_comment',
      {
        title: 'Edit a comment',
        description:
          'Edit a comment by its id (from list_comments or get_issue). Only the comment’s author, or ' +
          'an admin/product key owner, may edit it — otherwise it is refused. `mentions` REPLACES the ' +
          'set (names/emails); pass [] to clear them, or omit it to leave them unchanged.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
          comment: z.string().describe('Comment id to edit'),
          body: z.string().optional().describe('New body — Markdown, HTML or plain text'),
          mentions: z
            .array(z.string())
            .optional()
            .describe('Names/emails — REPLACES the mention set ([] clears)'),
        },
      },
      (dto) =>
        run<McpCommentResultDto>(
          (actor) => gated(actor, () => this.updateComment.execute({ actor, dto })),
          (c) => `Updated comment on ${c.issueShortId}\n\n${this.url(c.link)}`,
        ),
    );
  }

  private registerDeleteComment(server: McpServer, run: Run): void {
    registerTool<McpDeleteCommentDto>(
      server,
      'delete_comment',
      {
        title: 'Delete a comment',
        description:
          'Permanently delete a comment by its id (from list_comments or get_issue). This cannot be ' +
          'undone. Only the comment’s author, or an admin/product key owner, may delete it. Requires ' +
          'a key with delete access.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
          comment: z.string().describe('Comment id to delete'),
        },
        annotations: { destructiveHint: true },
      },
      (dto) =>
        run<McpDeletedCommentResponseDto>(
          (actor) => gatedDelete(actor, () => this.deleteComment.execute({ actor, dto })),
          (c) => `Deleted comment on ${c.issueShortId}`,
        ),
    );
  }

  private registerCreateBacklogItem(server: McpServer, run: Run): void {
    registerTool<McpCreateBacklogItemDto>(
      server,
      'create_backlog_item',
      {
        title: 'Add a backlog item',
        description:
          'Add an item to a product roadmap backlog (an opportunity or idea, not delivery work). ' +
          'Roadmap and column accept titles ("Now", "Next"). RICE inputs are scored 1–5 and default ' +
          'to 3. Omit `roadmap` when the workspace only has one.',
        inputSchema: {
          title: z.string().min(1),
          roadmap: z.string().optional().describe('Roadmap title or id'),
          description: z.string().optional(),
          phase: z.string().optional().describe('Column key or label — Now / Next / Later'),
          status: z.nativeEnum(RoadmapItemStatus).optional(),
          difficulty: z.nativeEnum(RoadmapDifficulty).optional(),
          reach: z.number().min(1).max(5).optional(),
          impact: z.number().min(1).max(5).optional(),
          confidence: z.number().min(1).max(5).optional(),
          effort: z.number().min(1).max(5).optional(),
          startDate: z.string().optional().describe('YYYY-MM-DD'),
          endDate: z.string().optional().describe('YYYY-MM-DD'),
        },
      },
      (dto) =>
        run<McpBacklogItemResponseDto>(
          (actor) => gated(actor, () => this.createBacklogItem.execute({ actor, dto })),
          (item) =>
            [
              `Added ${item.shortId} "${item.title}" to ${item.roadmapTitle} → ${item.phase}`,
              `RICE ${item.riceScore} · status ${item.status}`,
              this.url(item.link),
            ].join('\n'),
        ),
    );
  }

  private registerListBacklogItems(server: McpServer, run: Run): void {
    registerTool<McpListBacklogItemsDto>(
      server,
      'list_backlog_items',
      {
        title: 'List roadmap backlog items',
        description:
          'Browse the roadmap backlog — each item’s ref (RM-…), title, column, status and RICE score. ' +
          'Use it to pick an item to file a ticket under (create_issue `backlogItemId`) or to answer ' +
          '"what’s on the roadmap". Pass `roadmap` to one board, or omit it to list them all.',
        inputSchema: {
          roadmap: z.string().optional().describe('Roadmap title or id — omit to list every roadmap'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpBacklogItemBriefDto[]>(
          (actor) => this.listBacklogItems.execute({ actor, dto }),
          (items) =>
            items.length
              ? `${items.length} backlog item(s):\n\n${items.map((i) => this.describeBacklogItem(i)).join('\n\n')}`
              : 'No backlog items.',
        ),
    );
  }

  private registerCreateDoc(server: McpServer, run: Run): void {
    registerTool<McpCreateDocDto>(
      server,
      'create_doc',
      {
        title: 'Write a doc',
        description:
          'Write a document into the workspace — a PRD, discovery notes, a spec, a decision record. ' +
          'Use this for prose the team should read; work to be done belongs in create_issue or ' +
          'create_backlog_item. The doc opens on a first page holding the body you pass, and can ' +
          'include Mermaid diagrams — draw the flow rather than describing it in a paragraph.',
        inputSchema: {
          title: z.string().min(1).describe('Doc title, e.g. "Discovery — Ads Connect"'),
          content: z
            .string()
            .optional()
            .describe(
              'The page body. HTML is stored as-is — <h2>, <p>, <ul>/<ol>, <pre>, <table>, <b>, ' +
                '<i>, <a>, <img> all survive into the editor. Markdown is accepted too and is ' +
                'converted to those tags. A ```mermaid fence becomes a diagram block: any Mermaid ' +
                'syntax works (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, gantt, ' +
                'journey) and it is drawn on the page while staying editable as text.',
            ),
          tags: z
            .array(z.string())
            .optional()
            .describe('Free-text tags the docs hub filters on, e.g. ["discovery", "q3"]'),
        },
      },
      (dto) =>
        run<McpDocResponseDto>(
          (actor) => gated(actor, () => this.createDoc.execute({ actor, dto })),
          (doc) =>
            [
              `Created doc "${doc.title}"${doc.tags.length ? ` · ${doc.tags.join(', ')}` : ''}`,
              this.url(doc.link),
            ].join('\n'),
        ),
    );
  }

  private registerUpdateDoc(server: McpServer, run: Run): void {
    registerTool<McpUpdateDocDto>(
      server,
      'update_doc',
      {
        title: 'Edit an existing doc',
        description:
          'Edit a doc that already exists (create_doc makes a new one). Address it by ref (DOC-…) ' +
          'or id. `title` renames it and `tags` REPLACE its whole tag list. `content` REPLACES the ' +
          'ENTIRE body of one page — whatever you send becomes the page; to keep existing text, ' +
          'images or Mermaid diagrams, read them first (the doc in the app) and include them, or ' +
          'they are gone. The page edited is `page` (a page id) or, when omitted, the doc’s first ' +
          'page. To ADD a page rather than overwrite one, use `appendPage` instead of `content`. ' +
          'Body accepts HTML, Markdown or a ```mermaid fence, converted like create_doc.',
        inputSchema: {
          doc: z.string().describe('Doc ref (DOC-…) or id'),
          title: z.string().max(160).optional().describe('Rename the doc'),
          tags: z.array(z.string()).optional().describe('REPLACES the whole tag list'),
          page: z
            .string()
            .optional()
            .describe('Id of the page to edit; omit to edit the doc’s first page'),
          content: z
            .string()
            .optional()
            .describe(
              'New page body — REPLACES the whole body. HTML is stored as-is; Markdown and a ' +
                '```mermaid fence are converted. Include any existing content you want to keep.',
            ),
          appendPage: z
            .object({
              title: z.string().min(1).max(300).describe('Title for the new page'),
              content: z.string().optional().describe('Body — HTML, Markdown or a ```mermaid fence'),
            })
            .optional()
            .describe('Add a NEW page to the doc instead of editing one'),
        },
      },
      (dto) =>
        run<McpUpdatedDocResponseDto>(
          (actor) => gated(actor, () => this.updateDoc.execute({ actor, dto })),
          (doc) =>
            [
              `Updated doc "${doc.title}"${doc.changed ? ` — ${doc.changed}` : ''}` +
                `${doc.tags.length ? ` · ${doc.tags.join(', ')}` : ''}`,
              this.url(doc.link),
            ].join('\n'),
        ),
    );
  }

  private registerLinkIssues(server: McpServer, run: Run): void {
    registerTool<McpLinkIssuesDto>(
      server,
      'link_issues',
      {
        title: 'Link two issues',
        description:
          'Create a typed relation between two issues by their refs — "TSK-7 blocks TSK-9", ' +
          '"BUG-3 duplicate-of BUG-1". `type` accepts blocks, blocked-by, parent-of, sub-issue-of, ' +
          'related-to or duplicate-of; the relation reads from `from` to `to`. An unknown type comes ' +
          'back with the valid choices. Use list_links to see or unlink existing relations.',
        inputSchema: {
          from: z.string().describe('Source issue ref (TSK-7 / BUG-12) or id'),
          to: z.string().describe('Target issue ref (TSK-7 / BUG-12) or id'),
          type: z
            .string()
            .describe('blocks · blocked-by · parent-of · sub-issue-of · related-to · duplicate-of'),
        },
      },
      (dto) =>
        run<McpLinkResultDto>(
          (actor) => gated(actor, () => this.linkIssues.execute({ actor, dto })),
          (l) => `Linked ${l.fromShortId} ${l.relationType} ${l.toShortId}`,
        ),
    );
  }

  private registerListLinks(server: McpServer, run: Run): void {
    registerTool<McpListLinksDto>(
      server,
      'list_links',
      {
        title: 'List an issue’s relations',
        description:
          'Read the relations on a task or bug by its ref ("TSK-7") or id — each line shows the ' +
          'relation, the linked issue’s ref, title and status, and the link id (pass it to ' +
          'unlink_issues to remove the relation). Relations read from the asked-about issue’s side.',
        inputSchema: {
          issue: z.string().describe('Issue ref (TSK-7 / BUG-12) or id'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpIssueLinkDto[]>(
          (actor) => this.listLinks.execute({ actor, dto }),
          (links) =>
            links.length
              ? `${links.length} relation(s):\n\n${links.map((l) => this.describeLink(l)).join('\n')}`
              : 'No relations.',
        ),
    );
  }

  private registerUnlinkIssues(server: McpServer, run: Run): void {
    registerTool<McpUnlinkIssuesDto>(
      server,
      'unlink_issues',
      {
        title: 'Remove a relation between issues',
        description:
          'Remove one relation by its link id (from list_links). This detaches the two issues; it ' +
          'does not delete either issue, so a write key is enough — no delete access needed.',
        inputSchema: {
          link: z.string().describe('Link id (from list_links)'),
        },
      },
      (dto) =>
        run<McpUnlinkResultDto>(
          (actor) => gated(actor, () => this.unlinkIssues.execute({ actor, dto })),
          () => 'Removed link',
        ),
    );
  }

  /* ── Formatting ─────────────────────────────────────────────────────────── */

  private url(path: string): string {
    return `${this.appUrl}${path}`;
  }

  private describeIssueDetail(i: McpIssueDetailResponseDto): string {
    const head = [
      `${i.shortId} · ${i.title}`,
      `  ${i.kind} · ${i.teamName || 'no team'} · ${i.status}` +
        (i.assigneeNames.length ? ` · ${i.assigneeNames.join(', ')}` : '') +
        (i.severity ? ` · ${i.severity}` : '') +
        (i.estimate ? ` · ${i.estimate}pt` : ''),
      i.labelKeys.length ? `  labels: ${i.labelKeys.join(', ')}` : '',
      i.description ? `\n${i.description}` : '',
    ].filter(Boolean);
    const subtasks = i.subtaskCount
      ? [
          '',
          i.subtasks.length < i.subtaskCount
            ? `Subtasks (showing ${i.subtasks.length} of ${i.subtaskCount}):`
            : `Subtasks (${i.subtaskCount}):`,
          ...i.subtasks.map((s) => `  ${s.shortId} · ${s.title} · ${s.status}`),
        ]
      : ['', 'No subtasks.'];
    const comments = i.commentCount
      ? [
          '',
          i.comments.length < i.commentCount
            ? `Comments (latest ${i.comments.length} of ${i.commentCount} — list_comments for all):`
            : `Comments (${i.commentCount}):`,
          ...this.describeComments(i.comments).split('\n'),
        ]
      : ['', 'No comments.'];
    return [...head, ...subtasks, ...comments, '', `  ${this.url(i.link)}`].join('\n');
  }

  /** A comment thread as text — replies indented one level under their root. */
  private describeComments(comments: McpCommentDto[]): string {
    return comments
      .map((c) => {
        const indent = c.parentId ? '    ↳ ' : '  ';
        const when = c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '';
        return (
          `${indent}[${c.id}] ${c.authorName}${when ? ` · ${when}` : ''}` +
          (c.excerpt ? `\n${indent}  ${c.excerpt}` : '')
        );
      })
      .join('\n');
  }

  private describeIssue(i: McpIssueResponseDto): string {
    return [
      `${i.shortId} · ${i.title}`,
      `  ${i.kind} · ${i.teamName || 'no team'} · ${i.status}` +
        (i.assigneeNames.length ? ` · ${i.assigneeNames.join(', ')}` : '') +
        (i.severity ? ` · ${i.severity}` : ''),
      `  ${this.url(i.link)}`,
    ].join('\n');
  }

  private describeBacklogItem(i: McpBacklogItemBriefDto): string {
    return [
      `${i.shortId} · ${i.title}`,
      `  ${i.roadmapTitle} → ${i.phase} · ${i.status} · RICE ${i.riceScore}`,
      `  ${this.url(i.link)}`,
    ].join('\n');
  }

  private describeLink(l: McpIssueLinkDto): string {
    return `  ${l.relationType} · ${l.targetShortId} · ${l.targetTitle} · ${l.targetStatus} · [${l.id}]`;
  }

  private describeWorkspace(ctx: McpContextResponseDto): string {
    const teams = ctx.teams
      .map(
        (t) =>
          `- ${t.name} (${t.issueType}${t.isDefault ? ', default' : ''}) — statuses: ` +
          t.statuses.map((s) => s.key).join(', '),
      )
      .join('\n');
    const roadmaps = ctx.roadmaps.length
      ? ctx.roadmaps
          .map(
            (r) =>
              `- ${r.title} (${r.itemCount} item${r.itemCount === 1 ? '' : 's'}) — columns: ` +
              r.columns.map((c) => c.key).join(', '),
          )
          .join('\n')
      : '- (none yet)';
    const people = ctx.people.map((p) => `- ${p.name} <${p.email}>`).join('\n');
    return [
      `Acting as ${ctx.userName}${ctx.userEmail ? ` <${ctx.userEmail}>` : ''} via API key "${ctx.keyName}".`,
      '',
      'Teams:',
      teams || '- (none)',
      '',
      'Roadmaps:',
      roadmaps,
      '',
      'People:',
      people || '- (none)',
    ].join('\n');
  }
}

/* ── Registration ─────────────────────────────────────────────────────────── */

interface ToolConfig {
  title: string;
  description: string;
  /** Zod shape — the SDK turns it into the JSON Schema the client is shown. */
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** The un-generic shape of `McpServer.registerTool`, see below. */
type LooseRegister = (
  name: string,
  config: ToolConfig,
  handler: (args: unknown) => Promise<ToolResult>,
) => unknown;

/**
 * `registerTool`, with its argument inference switched off.
 *
 * The SDK derives a tool's argument type from its Zod shape through a v3/v4
 * compatibility layer, and that inference exceeds TypeScript's instantiation
 * depth in this project — Zod's types assume `strict`, and the backend compiles
 * with `strictNullChecks: false`. The schema still does its whole job at runtime
 * (it is what the client is shown, and what the SDK validates a call against);
 * only the compile-time inference is dropped, and each tool declares its input
 * type explicitly instead — the DTO its use-case already takes.
 */
function registerTool<TArgs = void>(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: (args: TArgs) => Promise<ToolResult>,
): void {
  (server.registerTool as unknown as LooseRegister)(
    name,
    config,
    handler as (args: unknown) => Promise<ToolResult>,
  );
}
