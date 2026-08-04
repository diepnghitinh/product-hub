import { ApiProperty } from '@nestjs/swagger';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';
import { TeamIssueType, TeamStatusConfig } from '@application/teams/domain/enums/team.enums';
import { RoadmapColumn } from '@application/roadmaps/domain/types/roadmap-item.type';

/** A team an MCP client can file into, with the exact status keys it accepts. */
export class McpTeamDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TeamIssueType })
  issueType: TeamIssueType;

  @ApiProperty({ description: 'Where issues of this kind land when no team is named' })
  isDefault: boolean;

  @ApiProperty({ description: 'The board columns — `key` is what `status` accepts' })
  statuses: TeamStatusConfig[];
}

export class McpRoadmapDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Columns — `key` is what `phase` accepts' })
  columns: RoadmapColumn[];

  @ApiProperty()
  itemCount: number;
}

export class McpPersonDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;
}

/**
 * Everything a client needs before its first write: who it is acting as, which
 * teams and roadmaps exist, and the exact keys their columns accept.
 */
export class McpContextResponseDto {
  @ApiProperty({ description: 'The API key label the call arrived on' })
  keyName: string;

  @ApiProperty({ description: 'The key owner — writes are attributed to them' })
  userName: string;

  @ApiProperty()
  userEmail: string;

  @ApiProperty({ type: [McpTeamDto] })
  teams: McpTeamDto[];

  @ApiProperty({ type: [McpRoadmapDto] })
  roadmaps: McpRoadmapDto[];

  @ApiProperty({ type: [McpPersonDto], description: 'Assignable people' })
  people: McpPersonDto[];
}

/** What an MCP client gets back after creating an issue — enough to quote a
 *  reference and hand the user a link, without a follow-up read. */
export class McpIssueResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IssueKind })
  kind: IssueKind;

  @ApiProperty({ description: 'Human reference, e.g. TSK-6HCUHKX' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  teamId: string;

  @ApiProperty()
  teamName: string;

  @ApiProperty({
    type: [String],
    description: 'Names of everyone on the issue, primary first (empty = unassigned)',
  })
  assigneeNames: string[];

  @ApiProperty()
  severity: string;

  @ApiProperty()
  estimate: number;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty({ description: 'In-app path, e.g. /issues/TSK-6HCUHKX' })
  link: string;

  @ApiProperty()
  updatedAt: Date;
}

/** One subtask line under an issue detail — enough to quote and address it. */
export class McpSubtaskDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Human reference, e.g. TSK-6HCUHKX' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  status: string;
}

/** One comment line — a flattened, excerpted view for a tool reply. Replies carry
 *  their root's id in `parentId` so a one-level thread reads back correctly. */
export class McpCommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty({ description: 'Plain-text excerpt of the body (~280 chars)' })
  excerpt: string;

  @ApiProperty({ description: 'Root comment id when this is a reply; empty for top-level' })
  parentId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** What add_comment/update_comment hand back — enough to confirm and to link. */
export class McpCommentResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'The issue the comment lives on' })
  issueId: string;

  @ApiProperty({ description: 'Issue ref, e.g. TSK-7' })
  issueShortId: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty({ description: 'Plain-text excerpt of the body (~280 chars)' })
  excerpt: string;

  @ApiProperty({ description: 'Root comment id when this is a reply; empty for top-level' })
  parentId: string;

  @ApiProperty({ description: 'In-app path to the issue, e.g. /issues/TSK-7' })
  link: string;
}

/** The trace delete_comment hands back — enough to confirm what went. */
export class McpDeletedCommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Issue ref the comment was on' })
  issueShortId: string;
}

/**
 * A full read of one issue: its flat fields, its subtasks, and its most recent
 * comments (`commentCount` is the total; `comments` is capped to the latest few,
 * with `list_comments` for the whole thread).
 */
export class McpIssueDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IssueKind })
  kind: IssueKind;

  @ApiProperty({ description: 'Human reference, e.g. TSK-6HCUHKX' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  teamId: string;

  @ApiProperty()
  teamName: string;

  @ApiProperty({ type: [String] })
  assigneeNames: string[];

  @ApiProperty()
  severity: string;

  @ApiProperty()
  estimate: number;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty({ type: [String], description: 'Team label keys on the issue' })
  labelKeys: string[];

  @ApiProperty({ type: [McpSubtaskDto], description: 'Subtasks (capped); see subtaskCount for total' })
  subtasks: McpSubtaskDto[];

  @ApiProperty({ description: 'Total subtasks on the issue' })
  subtaskCount: number;

  @ApiProperty({ type: [McpCommentDto], description: 'Latest comments (capped); see commentCount for total' })
  comments: McpCommentDto[];

  @ApiProperty({ description: 'Total comments on the issue' })
  commentCount: number;

  @ApiProperty({ description: 'In-app path, e.g. /issues/TSK-6HCUHKX' })
  link: string;

  @ApiProperty()
  updatedAt: Date;
}

/** The trace an MCP client gets back after a delete — enough to confirm what went. */
export class McpDeletedIssueResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IssueKind })
  kind: IssueKind;

  @ApiProperty()
  shortId: string;

  @ApiProperty()
  title: string;
}

/** A doc, plus the page its text went into — the link has to point at a page. */
export class McpDocResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'The first page, where the body was written' })
  pageId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ description: 'In-app path, e.g. /docs/<id>/<pageId>' })
  link: string;
}

/** What update_doc hands back — the doc's current state plus a note of what the
 *  call changed, so the assistant can confirm each part it asked for. */
export class McpUpdatedDocResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ description: 'In-app path to a page of the doc, e.g. /docs/<id>/<pageId>' })
  link: string;

  @ApiProperty({ description: 'Human summary of what changed, e.g. "renamed, edited a page"' })
  changed: string;
}

/** One backlog item in a browse listing — flat, enough to pick and link one. */
export class McpBacklogItemBriefDto {
  @ApiProperty({ example: 'RM-6HCUHKX', description: 'Ref to quote or link against' })
  shortId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'The column the item sits in' })
  phase: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ description: 'RICE, derived from reach × impact × confidence ÷ effort' })
  riceScore: number;

  @ApiProperty({ description: 'The roadmap the item belongs to' })
  roadmapTitle: string;

  @ApiProperty({ description: 'In-app path, e.g. /roadmaps/<id>/items/<itemId>' })
  link: string;
}

/** One relation touching an issue — flat, with the link id needed to unlink. */
export class McpIssueLinkDto {
  @ApiProperty({ description: 'Link id — pass to unlink_issues to remove the relation' })
  id: string;

  @ApiProperty({ description: 'Relation, from the asked-about issue’s perspective' })
  relationType: string;

  @ApiProperty({ description: 'The other issue’s ref' })
  targetShortId: string;

  @ApiProperty()
  targetTitle: string;

  @ApiProperty()
  targetStatus: string;
}

/** What link_issues hands back — enough to confirm the relation it created. */
export class McpLinkResultDto {
  @ApiProperty({ description: 'Source issue ref' })
  fromShortId: string;

  @ApiProperty({ description: 'Target issue ref' })
  toShortId: string;

  @ApiProperty({ description: 'The relation stored, from `from` to `to`' })
  relationType: string;
}

/** What unlink_issues hands back — the id of the relation that was removed. */
export class McpUnlinkResultDto {
  @ApiProperty({ description: 'The link id that was removed' })
  linkId: string;
}

export class McpBacklogItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'RM-6HCUHKX', description: 'Ref to quote back to the user' })
  shortId: string;

  @ApiProperty()
  roadmapId: string;

  @ApiProperty()
  roadmapTitle: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  phase: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ description: 'RICE, derived from reach × impact × confidence ÷ effort' })
  riceScore: number;

  @ApiProperty({ description: 'In-app path, e.g. /roadmaps/<id>/items/<itemId>' })
  link: string;
}
