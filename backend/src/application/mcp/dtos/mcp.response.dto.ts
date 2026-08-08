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

/** A testing project — where features, and so test cases, are filed. */
export class McpTestProjectDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'How many features (feature reports) it holds' })
  featureCount: number;
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

  @ApiProperty({ type: [McpTestProjectDto], description: 'Projects that hold test cases' })
  projects: McpTestProjectDto[];

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

  @ApiProperty({
    description:
      'The body as plain text (diagrams as ```mermaid fences). Read tools print it; ' +
      'search deliberately does not, so a result list stays scannable.',
  })
  description: string;

  @ApiProperty({ description: 'In-app path, e.g. /issues/TSK-6HCUHKX' })
  link: string;

  @ApiProperty()
  updatedAt: Date;
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

  @ApiProperty({ description: 'The body as plain text (diagrams as ```mermaid fences)' })
  description: string;

  @ApiProperty({ description: 'How hard the team judged it' })
  difficulty: string;

  @ApiProperty({ description: '0–100' })
  progress: number;

  @ApiProperty({ description: 'ISO YYYY-MM-DD, empty when nobody has scheduled it' })
  startDate: string;

  @ApiProperty({ description: 'ISO YYYY-MM-DD, empty when nobody has scheduled it' })
  endDate: string;

  @ApiProperty({ description: 'In-app path, e.g. /roadmaps/<id>/items/<itemId>' })
  link: string;
}

/**
 * One feature under test, with the tally its cases add up to.
 *
 * Flat by design: the rollup is what the question "how is testing going?" is
 * actually asking, and nesting it behind a `coverage` object would make an
 * assistant do arithmetic before it could answer.
 */
export class McpTestFeatureResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Short sidebar label' })
  label: string;

  @ApiProperty({ description: 'The team’s own feature id, when they use one' })
  featureId: string;

  @ApiProperty({ description: 'testing · done · info' })
  status: string;

  @ApiProperty()
  caseCount: number;

  @ApiProperty()
  passed: number;

  @ApiProperty()
  failed: number;

  @ApiProperty()
  blocked: number;

  @ApiProperty()
  retest: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  untested: number;

  @ApiProperty({ description: 'In-app path, e.g. /testing/<projectId>/reports/<id>' })
  link: string;
}

/** One test case, in the shape it is written and read back. */
export class McpTestCaseResponseDto {
  @ApiProperty({ description: 'The handle a run is recorded against, e.g. 6HCUHKX' })
  shortId: string;

  @ApiProperty({ description: 'What is being tested' })
  area: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  result: string;

  @ApiProperty()
  owner: string;

  @ApiProperty()
  precondition: string;

  @ApiProperty({ type: [String] })
  testSteps: string[];

  @ApiProperty()
  expectedResult: string;

  @ApiProperty()
  actualResult: string;

  @ApiProperty()
  note: string;

  @ApiProperty()
  featureId: string;

  @ApiProperty()
  featureTitle: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectTitle: string;

  @ApiProperty({ description: 'In-app path to the feature the case lives in' })
  link: string;
}

/**
 * What came back from writing a batch of cases. The cases are returned in full
 * because they only get their short id here, and that id is what a later run
 * result is recorded against — without it the assistant would have to read the
 * feature again just to record what it has already written.
 */
export class McpAddTestCasesResponseDto {
  @ApiProperty({ type: McpTestFeatureResponseDto })
  feature: McpTestFeatureResponseDto;

  @ApiProperty({ type: [McpTestCaseResponseDto] })
  added: McpTestCaseResponseDto[];

  @ApiProperty({ description: 'Rows that held nothing worth storing' })
  skipped: number;

  @ApiProperty({ description: 'True when the feature did not exist and was created' })
  featureCreated: boolean;
}
