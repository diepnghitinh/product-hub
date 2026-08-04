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

  @ApiPropertyOptional({ description: "Team id or name. Defaults to the workspace's team for the kind" })
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional({ description: "Status key or column label. Defaults to the team's first column" })
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

  @ApiPropertyOptional({
    description:
      'Parent issue ref (TSK-7) or id — creates this as a subtask nested under it (task).',
  })
  @IsOptional()
  @IsString()
  parent?: string;
}

/** Read one issue in full — the ref (`TSK-7`) or its uuid. */
export class McpGetIssueDto {
  @ApiProperty({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  issue: string;
}

/**
 * Patch an issue. Every field but `issue` is optional and only the ones sent
 * change. `assignee` and `labels` REPLACE the whole set (they are not additive).
 * There is no `status` here — moving an issue between columns is `set_issue_status`
 * — and no `team`, which the update use-case cannot change.
 */
export class McpUpdateIssueDto {
  // Optional at the DTO layer because the REST route supplies it from the `:issue`
  // path segment; the JSON-RPC tool requires it via its own zod schema.
  @ApiPropertyOptional({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsOptional()
  @IsString()
  issue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Plain text or HTML — replaces the description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Names/emails, comma-separated — REPLACES the whole assignee set. "" unassigns everyone',
  })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ description: "Team cycle to commit to; '' leaves the cycle" })
  @IsOptional()
  @IsString()
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Story points — tasks only' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimate?: number;

  @ApiPropertyOptional({ enum: BugSeverity, description: 'Bugs only' })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ description: "Start date YYYY-MM-DD; '' clears it" })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date YYYY-MM-DD; '' clears it" })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Parent issue ref/id to nest under; '' detaches (task)" })
  @IsOptional()
  @IsString()
  parent?: string;

  @ApiPropertyOptional({ description: "Backlog item ref/id to link; '' unlinks" })
  @IsOptional()
  @IsString()
  backlogItem?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Team label keys — REPLACES the whole label set ([] clears them)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}

/** Move an issue to another status column (validated against the team's board). */
export class McpSetStatusDto {
  // Supplied by the REST `:issue` path segment; required in the JSON-RPC schema.
  @ApiPropertyOptional({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsOptional()
  @IsString()
  issue?: string;

  @ApiProperty({ description: "Status key or column label — one of the team board's columns" })
  @IsString()
  @IsNotEmpty()
  status: string;
}

/** Delete an issue. Refused if the issue still has subtasks. */
export class McpDeleteIssueDto {
  @ApiProperty({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  issue: string;
}

/** List every comment on an issue (thread order), by its ref or uuid. */
export class McpListCommentsDto {
  @ApiProperty({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  issue: string;
}

/**
 * Add a comment (or a reply) to an issue thread. `mentions` are names/emails —
 * resolved to userIds server-side, so the @mention ping reaches the right person.
 */
export class McpAddCommentDto {
  // Supplied by the REST `:issue` path segment; required in the JSON-RPC schema.
  @ApiPropertyOptional({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsOptional()
  @IsString()
  issue?: string;

  @ApiProperty({ description: 'Comment body — Markdown, HTML or plain text (Markdown is converted)' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    description: 'Id of the comment being replied to (from list_comments/get_issue)',
  })
  @IsOptional()
  @IsString()
  replyTo?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'People to mention by name or email — resolved to users for you',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];
}

/**
 * Edit a comment by its id. Only the author or an admin/product key owner may.
 * `mentions` REPLACES the set (names/emails); pass `[]` to clear them.
 */
export class McpUpdateCommentDto {
  // Both ids come from the REST path (`/issues/:issue/comments/:comment`); the
  // JSON-RPC tool requires them via its zod schema.
  @ApiPropertyOptional({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsOptional()
  @IsString()
  issue?: string;

  @ApiPropertyOptional({ description: 'Comment id (from list_comments/get_issue)' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'New body — Markdown, HTML or plain text (Markdown is converted)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Names/emails — REPLACES the mention set ([] clears them)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];
}

/** Delete a comment by its id (author or admin/product only). */
export class McpDeleteCommentDto {
  @ApiProperty({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  issue: string;

  @ApiProperty({ description: 'Comment id (from list_comments/get_issue)' })
  @IsString()
  @IsNotEmpty()
  comment: string;
}

export class McpCreateBacklogItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Roadmap id or title. Defaults to the only roadmap when there is one' })
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

/**
 * A new page to append to an existing doc — its own title and (optional) body.
 * The body converts through `docBodyToHtml` just like `content`, so Markdown and
 * a ```mermaid fence become real page blocks rather than literal text.
 */
export class McpAppendPageDto {
  @ApiProperty({ description: 'Title for the new page' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ description: 'Page body — HTML, Markdown or a ```mermaid fence' })
  @IsOptional()
  @IsString()
  content?: string;
}

/**
 * Edit a doc that already exists. `title`/`tags` change the doc itself; `content`
 * REPLACES the body of one page (the given `page`, or the first page when omitted);
 * `appendPage` adds a new page instead of editing one. Every field is optional —
 * pass only the change you mean. `content` and `appendPage.content` are converted
 * exactly like create_doc (HTML kept as-is, Markdown and ```mermaid rendered).
 */
export class McpUpdateDocDto {
  // Supplied by the REST `:doc` path segment; required in the JSON-RPC schema.
  @ApiPropertyOptional({ description: 'Doc ref (DOC-…) or id' })
  @IsOptional()
  @IsString()
  doc?: string;

  @ApiPropertyOptional({ description: 'Rename the doc' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ type: [String], description: 'REPLACES the whole tag list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Id of the page to edit; omitted = the doc’s first page' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: 'New page body — REPLACES the whole body. HTML, Markdown or a ```mermaid fence',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: McpAppendPageDto, description: 'Add a new page instead of editing' })
  @IsOptional()
  @ValidateNested()
  @Type(() => McpAppendPageDto)
  appendPage?: McpAppendPageDto;
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

  @ApiPropertyOptional({
    description: "Parent issue ref (TSK-7) or id — lists that issue's subtasks.",
  })
  @IsOptional()
  @IsString()
  parent?: string;

  @ApiPropertyOptional({
    description:
      'Backlog (roadmap) item ref (RM-6HCUHKX) or id — lists the tickets linked to that item.',
  })
  @IsOptional()
  @IsString()
  backlog?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

/** Browse a roadmap's backlog items, so an assistant can pick one to link/file under. */
export class McpListBacklogItemsDto {
  @ApiPropertyOptional({ description: 'Roadmap title or id. Omit to list every roadmap.' })
  @IsOptional()
  @IsString()
  roadmap?: string;
}

/** Create a typed relation between two issues (task↔task or bug↔bug). */
export class McpLinkIssuesDto {
  @ApiProperty({ description: 'Source issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'Target issue ref (TSK-7 / BUG-12) or id' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({
    description:
      'Relation from `from` to `to` — blocks, blocked-by, parent-of, sub-issue-of, related-to, duplicate-of',
  })
  @IsString()
  @IsNotEmpty()
  type: string;
}

/** List every relation touching an issue (each carries the link id for unlink). */
export class McpListLinksDto {
  // Supplied by the REST `:issue` path segment; required in the JSON-RPC schema.
  @ApiPropertyOptional({ description: 'Issue ref (TSK-7 / BUG-12) or id' })
  @IsOptional()
  @IsString()
  issue?: string;
}

/** Remove one relation by its link id (from list_links). */
export class McpUnlinkIssuesDto {
  // Supplied by the REST `:link` path segment; required in the JSON-RPC schema.
  @ApiPropertyOptional({ description: 'Link id (from list_links)' })
  @IsOptional()
  @IsString()
  link?: string;
}
