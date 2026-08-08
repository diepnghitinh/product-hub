import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BugSeverity, IssueKind } from '@application/issues/domain/enums/issue.enums';
import {
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@application/roadmaps/domain/enums/roadmap.enums';
import { TestResult } from '@application/reports/domain/enums/test-result.enum';
import { TestType } from '@application/reports/domain/enums/test-type.enum';

/**
 * MCP request shapes. Every reference to another record accepts *either* an id
 * or the human name — an assistant reads "file it under QC" long before it reads
 * a uuid, and forcing it to look one up first turns one tool call into three.
 * Resolution lives server-side so any future transport inherits it.
 */
export class McpCreateIssueDto {
  @ApiProperty({ enum: IssueKind, description: 'task or bug' })
  @IsEnum(IssueKind)
  kind: IssueKind;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Plain text or HTML' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Team id or name. Defaults to the workspace's team for the kind",
  })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({
    description: "Status key or column label. Defaults to the team's first column",
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Assignee user id, name or email' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ enum: BugSeverity, description: 'Bugs only' })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: 'Story points — tasks only' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimate?: number;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Backlog (roadmap) item id to file this under — its roadmap is resolved for you',
  })
  @IsOptional()
  @IsString()
  backlogItemId?: string;
}

export class McpCreateBacklogItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Roadmap id or title. Defaults to the only roadmap when there is one',
  })
  @IsOptional()
  @IsString()
  roadmap?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Column key or label — Now / Next / Later, or a custom one' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ enum: RoadmapItemStatus })
  @IsOptional()
  @IsEnum(RoadmapItemStatus)
  status?: RoadmapItemStatus;

  @ApiPropertyOptional({ enum: RoadmapDifficulty })
  @IsOptional()
  @IsEnum(RoadmapDifficulty)
  difficulty?: RoadmapDifficulty;

  // The board scores RICE on 1–5 for every input (not the classic mixed scales),
  // so the same bounds the item page enforces apply here. Default 3 across the
  // board — a score of 9, exactly what the app's own "+ Add" creates.
  @ApiPropertyOptional({ description: 'RICE reach, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  reach?: number;

  @ApiPropertyOptional({ description: 'RICE impact, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional({ description: 'RICE confidence, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  confidence?: number;

  @ApiPropertyOptional({ description: 'RICE effort, 1–5', default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  effort?: number;

  @ApiPropertyOptional({ description: 'ISO date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Target end date, ISO (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

/**
 * A doc is a container whose writing lives in its pages, and it is created with
 * one page named after it — so a doc and its opening page arrive together here,
 * rather than making an assistant call twice to end up with any text at all.
 */
export class McpCreateDocDto {
  @ApiProperty({ example: 'Discovery — Ads Connect' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({
    description: 'The first page body as HTML; Markdown is accepted and converted',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [String], description: 'Free-text tags for the docs hub filter' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

/** Lookup before creating, so an assistant can spot a duplicate itself. */
export class McpSearchIssuesDto {
  @ApiPropertyOptional({ description: 'Free-text match on title / reference' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: IssueKind })
  @IsOptional()
  @IsEnum(IssueKind)
  kind?: IssueKind;

  @ApiPropertyOptional({ description: 'Team id or name' })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

/** Read one issue. A ref is the whole input — the tool answers, it doesn't search. */
export class McpGetIssueDto {
  @ApiProperty({ example: 'TSK-6HCUHKX', description: 'Issue ref, or its uuid' })
  @IsString()
  ref: string;
}

/** Read one backlog item, by ref or (failing that) by title. */
export class McpGetBacklogItemDto {
  @ApiProperty({ example: 'RM-6HCUHKX', description: 'Backlog item ref, uuid, or exact title' })
  @IsString()
  ref: string;
}

/* ── Testing ──────────────────────────────────────────────────────────────── */

/** The features (feature reports) of one testing project. */
export class McpListTestFeaturesDto {
  @ApiPropertyOptional({
    description: 'Project id, slug or title. Defaults to the only project when there is one',
  })
  @IsOptional()
  @IsString()
  project?: string;
}

export class McpGetTestCasesDto {
  @ApiProperty({ description: 'Feature title, label, slug, feature id or uuid' })
  @IsString()
  @IsNotEmpty()
  feature: string;

  @ApiPropertyOptional({ description: 'Project id, slug or title' })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({ enum: TestResult, description: 'Only cases with this result' })
  @IsOptional()
  @IsEnum(TestResult)
  result?: TestResult;
}

/**
 * One test case as an assistant writes it.
 *
 * `type` and `result` are typed as strings rather than enums because everything
 * here is normalised by the same rules a spreadsheet import goes through — the
 * aliases it accepts ("functional", "e2e", "pass", "n/a") work, and anything
 * unrecognised lands as blank / Untested instead of failing the batch.
 *
 * The MCP tool schema is stricter than this on purpose: it advertises the exact
 * six results and ten types, so a model is told the vocabulary up front rather
 * than discovering it from a value that quietly became "Untested".
 */
export class McpTestCaseInputDto {
  @ApiProperty({
    example: 'Sign in with a valid email and password',
    description: 'What is being tested — the Area column',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  area: string;

  @ApiPropertyOptional({ enum: TestType, description: 'Functional, UI, API, Regression…' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: TestResult, default: TestResult.UNTESTED })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: 'Who runs it' })
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({ description: 'State the system must be in first' })
  @IsOptional()
  @IsString()
  precondition?: string;

  @ApiPropertyOptional({ type: [String], description: 'The steps, in order' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testSteps?: string[];

  @ApiPropertyOptional({ description: 'What should happen' })
  @IsOptional()
  @IsString()
  expectedResult?: string;

  @ApiPropertyOptional({ description: 'What did happen — usually left empty until it is run' })
  @IsOptional()
  @IsString()
  actualResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Write test cases into a feature. The batch is the point: a model that has read
 * a spec has twenty cases to file, and twenty tool calls is twenty chances to
 * stop halfway.
 */
export class McpAddTestCasesDto {
  @ApiProperty({ description: 'Feature title, label, slug, feature id or uuid' })
  @IsString()
  @IsNotEmpty()
  feature: string;

  @ApiProperty({ type: [McpTestCaseInputDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => McpTestCaseInputDto)
  cases: McpTestCaseInputDto[];

  @ApiPropertyOptional({ description: 'Project id, slug or title' })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({
    description: 'Create the feature when no existing one matches, instead of failing',
    default: false,
  })
  @IsOptional()
  createFeature?: boolean;
}

/** Record a run: one case's outcome, audited like the tester's own dropdown. */
export class McpSetTestCaseResultDto {
  @ApiProperty({ example: '6HCUHKX', description: 'The case short id shown in the test table' })
  @IsString()
  @IsNotEmpty()
  testCase: string;

  @ApiProperty({ enum: TestResult })
  @IsEnum(TestResult)
  result: TestResult;

  @ApiPropertyOptional({ description: 'Project id, slug or title — searched everywhere if absent' })
  @IsOptional()
  @IsString()
  project?: string;
}
