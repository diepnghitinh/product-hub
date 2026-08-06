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
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpGetBacklogItemDto,
  McpGetIssueDto,
  McpSearchIssuesDto,
} from '@application/mcp/dtos/mcp.dtos';
import {
  McpBacklogItemResponseDto,
  McpContextResponseDto,
  McpDocResponseDto,
  McpIssueResponseDto,
} from '@application/mcp/dtos/mcp.response.dto';
import {
  GetMcpContextUseCase,
  McpActor,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpSearchIssuesUseCase,
} from '@application/mcp/use-cases';

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
    private readonly createBacklogItem: McpCreateBacklogItemUseCase,
    private readonly createDoc: McpCreateDocUseCase,
    private readonly searchIssues: McpSearchIssuesUseCase,
    private readonly getIssue: McpGetIssueUseCase,
    private readonly getBacklogItem: McpGetBacklogItemUseCase,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_BASE_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
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
    this.registerGetBacklogItem(server, run);
    this.registerCreateIssue(server, run);
    this.registerCreateBacklogItem(server, run);
    this.registerCreateDoc(server, run);

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
          'a duplicate, or to quote an issue back to the user.',
        inputSchema: {
          search: z.string().optional().describe('Free text matched against title and reference'),
          kind: z.nativeEnum(IssueKind).optional(),
          team: z.string().optional().describe('Team name or id'),
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

  private registerGetIssue(server: McpServer, run: Run): void {
    registerTool<McpGetIssueDto>(
      server,
      'get_issue',
      {
        title: 'Read a task or bug',
        description:
          'The full text of one issue by its ref (TSK-6HCUHKX, BUG-6HCUHKX) — description included, ' +
          'with any diagram as a ```mermaid fence. Use it to answer questions about an issue or to ' +
          'work from what it actually says; search_issues finds the ref when you only know a title.',
        inputSchema: {
          ref: z.string().min(1).describe('Issue ref (TSK-6HCUHKX / BUG-6HCUHKX) or its id'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpIssueResponseDto>(
          (actor) => this.getIssue.execute({ actor, dto }),
          (issue) => this.describeIssueInFull(issue),
        ),
    );
  }

  private registerGetBacklogItem(server: McpServer, run: Run): void {
    registerTool<McpGetBacklogItemDto>(
      server,
      'get_backlog_item',
      {
        title: 'Read a backlog item',
        description:
          'The full text of one roadmap backlog item by ref (RM-6HCUHKX) or exact title — the ' +
          'opportunity as written, with its RICE inputs, column and dates. Use it before adding ' +
          'delivery work under an item, or to answer what the item actually proposes.',
        inputSchema: {
          ref: z.string().min(1).describe('Backlog item ref (RM-6HCUHKX), id, or its exact title'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpBacklogItemResponseDto>(
          (actor) => this.getBacklogItem.execute({ actor, dto }),
          (item) => this.describeBacklogItemInFull(item),
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
          'instead of guessing. Omit `team` to use the workspace default for the kind.',
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
        },
      },
      (dto) =>
        run<McpIssueResponseDto>(
          (actor) => this.createIssue.execute({ actor, dto }),
          (issue) => `Created ${issue.shortId} — ${issue.title}\n\n${this.describeIssue(issue)}`,
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
          (actor) => this.createBacklogItem.execute({ actor, dto }),
          (item) =>
            [
              `Added ${item.shortId} "${item.title}" to ${item.roadmapTitle} → ${item.phase}`,
              `RICE ${item.riceScore} · status ${item.status}`,
              this.url(item.link),
            ].join('\n'),
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
          (actor) => this.createDoc.execute({ actor, dto }),
          (doc) =>
            [
              `Created doc "${doc.title}"${doc.tags.length ? ` · ${doc.tags.join(', ')}` : ''}`,
              this.url(doc.link),
            ].join('\n'),
        ),
    );
  }

  /* ── Formatting ─────────────────────────────────────────────────────────── */

  private url(path: string): string {
    return `${this.appUrl}${path}`;
  }

  /** The long form: everything `describeIssue` prints, plus what it leaves out. */
  private describeIssueInFull(i: McpIssueResponseDto): string {
    const dates = [i.startDate, i.endDate].filter(Boolean).join(' → ');
    const facts = [
      `kind: ${i.kind}`,
      `team: ${i.teamName || 'none'}`,
      `status: ${i.status}`,
      `assignees: ${i.assigneeNames.join(', ') || 'unassigned'}`,
      i.severity ? `severity: ${i.severity}` : '',
      i.estimate ? `estimate: ${i.estimate} point(s)` : '',
      dates ? `dates: ${dates}` : '',
    ].filter(Boolean);
    return [
      `${i.shortId} · ${i.title}`,
      facts.map((f) => `  ${f}`).join('\n'),
      `  ${this.url(i.link)}`,
      '',
      i.description || '(no description)',
    ].join('\n');
  }

  private describeBacklogItemInFull(b: McpBacklogItemResponseDto): string {
    const dates = [b.startDate, b.endDate].filter(Boolean).join(' → ');
    const facts = [
      `roadmap: ${b.roadmapTitle}`,
      b.phase ? `column: ${b.phase}` : '',
      b.status ? `status: ${b.status}` : '',
      b.difficulty ? `difficulty: ${b.difficulty}` : '',
      `RICE: ${b.riceScore}`,
      b.progress ? `progress: ${b.progress}%` : '',
      dates ? `dates: ${dates}` : '',
    ].filter(Boolean);
    return [
      `${b.shortId || b.id} · ${b.title}`,
      facts.map((f) => `  ${f}`).join('\n'),
      `  ${this.url(b.link)}`,
      '',
      b.description || '(no description)',
    ].join('\n');
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
  annotations?: { readOnlyHint?: boolean };
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
