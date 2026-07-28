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

  @ApiProperty()
  assigneeName: string;

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

export class McpBacklogItemResponseDto {
  @ApiProperty()
  id: string;

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
