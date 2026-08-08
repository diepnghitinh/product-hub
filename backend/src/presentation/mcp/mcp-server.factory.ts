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
import { TestResult } from '@application/reports/domain/enums/test-result.enum';
import { TestType } from '@application/reports/domain/enums/test-type.enum';
import {
  McpAddTestCasesDto,
  McpCreateBacklogItemDto,
  McpCreateDocDto,
  McpCreateIssueDto,
  McpGetBacklogItemDto,
  McpGetIssueDto,
  McpGetTestCasesDto,
  McpListTestFeaturesDto,
  McpSearchIssuesDto,
  McpSetTestCaseResultDto,
} from '@application/mcp/dtos/mcp.dtos';
import {
  McpAddTestCasesResponseDto,
  McpBacklogItemResponseDto,
  McpContextResponseDto,
  McpDocResponseDto,
  McpIssueResponseDto,
  McpTestCaseResponseDto,
  McpTestFeatureResponseDto,
} from '@application/mcp/dtos/mcp.response.dto';
import {
  GetMcpContextUseCase,
  McpActor,
  McpAddTestCasesUseCase,
  McpCreateBacklogItemUseCase,
  McpCreateDocUseCase,
  McpCreateIssueUseCase,
  McpGetBacklogItemUseCase,
  McpGetIssueUseCase,
  McpGetTestCasesUseCase,
  McpListTestFeaturesUseCase,
  McpSearchIssuesUseCase,
  McpSetTestCaseResultUseCase,
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
    private readonly listTestFeatures: McpListTestFeaturesUseCase,
    private readonly getTestCases: McpGetTestCasesUseCase,
    private readonly addTestCases: McpAddTestCasesUseCase,
    private readonly setTestCaseResult: McpSetTestCaseResultUseCase,
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
    this.registerListTestFeatures(server, run);
    this.registerGetTestCases(server, run);
    this.registerAddTestCases(server, run);
    this.registerSetTestCaseResult(server, run);

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
          'Teams (with the exact status keys their boards accept), roadmaps (with their column ' +
          'keys), testing projects and the people who can be assigned. Call this before creating ' +
          'anything so you use real names — bugs go to bug teams, tasks to task teams, test cases ' +
          'go into a feature of a testing project.',
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

  /* ── Testing ────────────────────────────────────────────────────────────── */

  private registerListTestFeatures(server: McpServer, run: Run): void {
    registerTool<McpListTestFeaturesDto>(
      server,
      'list_test_features',
      {
        title: 'List the features under test',
        description:
          'The features of a testing project, each with how many test cases it holds and how ' +
          'they stand (passed / failed / blocked / untested). Call it to answer "how is testing ' +
          'going?", or before writing cases so you use a feature that already exists. Omit ' +
          '`project` when the workspace only has one.',
        inputSchema: {
          project: z.string().optional().describe('Project title or id'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpTestFeatureResponseDto[]>(
          (actor) => this.listTestFeatures.execute({ actor, dto }),
          (features) =>
            features.length
              ? [
                  `${features.length} feature(s) in ${features[0].projectTitle}:`,
                  '',
                  features.map((f) => this.describeFeature(f)).join('\n\n'),
                ].join('\n')
              : 'That project has no features yet — add_test_cases with createFeature: true starts one.',
        ),
    );
  }

  private registerGetTestCases(server: McpServer, run: Run): void {
    registerTool<McpGetTestCasesDto>(
      server,
      'get_test_cases',
      {
        title: 'Read a feature’s test cases',
        description:
          'Every test case of one feature, in full — preconditions, steps, expected result and ' +
          'the last recorded outcome. Use it to review coverage before writing more (so you add ' +
          'what is missing instead of what is already there), or with `result` to answer "what ' +
          'is failing?".',
        inputSchema: {
          feature: z.string().min(1).describe('Feature title, label, slug or feature id'),
          project: z.string().optional().describe('Project title or id'),
          result: z.nativeEnum(TestResult).optional().describe('Only cases with this outcome'),
        },
        annotations: { readOnlyHint: true },
      },
      (dto) =>
        run<McpTestCaseResponseDto[]>(
          (actor) => this.getTestCases.execute({ actor, dto }),
          (cases) =>
            cases.length
              ? [
                  `${cases.length} test case(s) · ${cases[0].featureTitle} · ${cases[0].projectTitle}`,
                  `  ${this.url(cases[0].link)}`,
                  '',
                  cases.map((c) => this.describeTestCase(c)).join('\n\n'),
                ].join('\n')
              : 'No test cases match.',
        ),
    );
  }

  private registerAddTestCases(server: McpServer, run: Run): void {
    registerTool<McpAddTestCasesDto>(
      server,
      'add_test_cases',
      {
        title: 'Write test cases',
        description:
          'Write test cases into a feature — the whole batch in one call, exactly as a ' +
          'spreadsheet import would. Read the spec or the issue first, then cover the happy ' +
          'path, the edge cases and the failure modes; each case gets a short id back, which is ' +
          'what a result is later recorded against. An unknown feature name comes back with the ' +
          'real ones — pass `createFeature: true` when you genuinely mean a new feature.',
        inputSchema: {
          feature: z
            .string()
            .min(1)
            .describe('Feature to file them under — title, label, slug or feature id'),
          cases: z
            .array(
              z.object({
                area: z
                  .string()
                  .min(1)
                  .describe('What this case tests, e.g. "Sign in with a valid password"'),
                type: z
                  .nativeEnum(TestType)
                  .optional()
                  .describe('Functional, UI, API, Regression… — defaults to blank'),
                result: z
                  .nativeEnum(TestResult)
                  .optional()
                  .describe('Defaults to Untested — leave it unless you ran the case'),
                owner: z.string().optional().describe('Who runs it'),
                precondition: z.string().optional().describe('State the system must be in first'),
                testSteps: z.array(z.string()).optional().describe('The steps, in order'),
                expectedResult: z.string().optional().describe('What should happen'),
                actualResult: z.string().optional(),
                note: z.string().optional(),
              }),
            )
            .min(1)
            .max(200),
          project: z.string().optional().describe('Project title or id'),
          createFeature: z
            .boolean()
            .optional()
            .describe('Create the feature when none matches, instead of failing'),
        },
      },
      (dto) =>
        run<McpAddTestCasesResponseDto>(
          (actor) => this.addTestCases.execute({ actor, dto }),
          (res) =>
            [
              `Added ${res.added.length} test case(s) to ${res.featureCreated ? 'new feature ' : ''}` +
                `"${res.feature.title}" in ${res.feature.projectTitle}` +
                (res.skipped ? ` (${res.skipped} empty row(s) skipped)` : ''),
              `  ${this.url(res.feature.link)}`,
              '',
              res.added.map((c) => `  ${c.shortId} · ${c.area}`).join('\n'),
            ].join('\n'),
        ),
    );
  }

  private registerSetTestCaseResult(server: McpServer, run: Run): void {
    registerTool<McpSetTestCaseResultDto>(
      server,
      'set_test_case_result',
      {
        title: 'Record a test run',
        description:
          'Set one test case’s outcome by its short id. The change is audited in the project’s ' +
          'History under your name, exactly as if a tester had set it in the app — so only ' +
          'record what was actually run.',
        inputSchema: {
          testCase: z.string().min(1).describe('The case short id shown in the test table'),
          result: z.nativeEnum(TestResult),
          project: z.string().optional().describe('Project title or id — searched all if omitted'),
        },
      },
      (dto) =>
        run<McpTestCaseResponseDto>(
          (actor) => this.setTestCaseResult.execute({ actor, dto }),
          (c) =>
            [
              `${c.shortId} · ${c.area} → ${c.result}`,
              `  ${c.featureTitle} · ${c.projectTitle}`,
              `  ${this.url(c.link)}`,
            ].join('\n'),
        ),
    );
  }

  /* ── Formatting ─────────────────────────────────────────────────────────── */

  private url(path: string): string {
    return `${this.appUrl}${path}`;
  }

  /** A feature as one line of identity and one of tally — zero counts omitted,
   *  so a feature nobody has run reads "12 cases · 12 untested" and no noise. */
  private describeFeature(f: McpTestFeatureResponseDto): string {
    const tally = [
      f.passed ? `${f.passed} passed` : '',
      f.failed ? `${f.failed} failed` : '',
      f.blocked ? `${f.blocked} blocked` : '',
      f.retest ? `${f.retest} retest` : '',
      f.skipped ? `${f.skipped} skipped` : '',
      f.untested ? `${f.untested} untested` : '',
    ].filter(Boolean);
    return [
      `${f.title}${f.featureId ? ` (${f.featureId})` : ''}`,
      `  ${f.status} · ${f.caseCount} case(s)${tally.length ? ` · ${tally.join(', ')}` : ''}`,
      `  ${this.url(f.link)}`,
    ].join('\n');
  }

  private describeTestCase(c: McpTestCaseResponseDto): string {
    const facts = [
      c.type ? `type: ${c.type}` : '',
      `result: ${c.result}`,
      c.owner ? `owner: ${c.owner}` : '',
      c.precondition ? `precondition: ${c.precondition}` : '',
      c.testSteps.length
        ? `steps:\n${c.testSteps.map((s, i) => `    ${i + 1}. ${s}`).join('\n')}`
        : '',
      c.expectedResult ? `expected: ${c.expectedResult}` : '',
      c.actualResult ? `actual: ${c.actualResult}` : '',
      c.note ? `note: ${c.note}` : '',
    ].filter(Boolean);
    return [`${c.shortId} · ${c.area}`, facts.map((f) => `  ${f}`).join('\n')].join('\n');
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
    const projects = ctx.projects.length
      ? ctx.projects
          .map((p) => `- ${p.title} (${p.featureCount} feature${p.featureCount === 1 ? '' : 's'})`)
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
      'Testing projects (test cases live in a feature of one of these):',
      projects,
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
