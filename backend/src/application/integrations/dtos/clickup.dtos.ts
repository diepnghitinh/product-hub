import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClickUpLinkTarget } from '@application/app-settings/domain/clickup.types';

/**
 * Step one of connecting: prove a token works and find out what it can see.
 *
 * Split from `ConnectClickUpDto` on purpose — an admin pastes a token before
 * they can possibly know their workspace id, so the UI asks ClickUp first and
 * offers the answer as a list.
 */
export class ProbeClickUpDto {
  @ApiProperty({ example: 'pk_1234567_ABCDEF…', description: 'A ClickUp personal API token.' })
  @IsString()
  @MaxLength(200)
  apiToken: string;
}

/** Step two: commit to one workspace and register the webhook. */
export class ConnectClickUpDto {
  @ApiProperty({ description: 'Send again — the token is never echoed back to be resent.' })
  @IsString()
  @MaxLength(200)
  apiToken: string;

  @ApiProperty({ example: '9008152', description: 'ClickUp workspace ("team") id.' })
  @IsString()
  @MaxLength(64)
  workspaceId: string;

  @ApiProperty({ required: false, description: 'Display name, so Settings can name it offline.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workspaceName?: string;
}

/** Pause the mirror without throwing the connection away. */
export class UpdateClickUpDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

/** Link one ClickUp task to one product-os record. */
export class LinkClickUpTaskDto {
  @ApiProperty({
    example: 'https://app.clickup.com/t/86abc123',
    description: 'A task URL, a task id, or a custom id like DEV-123.',
  })
  @IsString()
  @MaxLength(500)
  reference: string;

  @ApiProperty({ enum: ClickUpLinkTarget, example: ClickUpLinkTarget.ISSUE })
  @IsEnum(ClickUpLinkTarget)
  targetType: ClickUpLinkTarget;

  @ApiProperty({ description: 'The issue id, or the roadmap *item* id.' })
  @IsString()
  @MaxLength(64)
  targetId: string;

  @ApiProperty({
    required: false,
    description: 'Which roadmap owns the item. Required for roadmap_item, ignored for an issue.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roadmapId?: string;
}

/** Which record's links to read. */
export class GetClickUpLinksQueryDto {
  @ApiProperty({ enum: ClickUpLinkTarget, example: ClickUpLinkTarget.ISSUE })
  @IsEnum(ClickUpLinkTarget)
  targetType: ClickUpLinkTarget;

  @ApiProperty({ description: 'The issue id, or the roadmap *item* id.' })
  @IsString()
  @MaxLength(64)
  targetId: string;
}

/**
 * One linked ClickUp task, as a detail panel sees it.
 *
 * Flat by house rule, and mirrored rather than live: every field below is what
 * ClickUp said at `lastSyncedAt`, not what it says right now. The UI shows that
 * timestamp so "stale" reads as a fact rather than a bug.
 */
export class ClickUpLinkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'ClickUp’s own task id.' })
  clickupTaskId: string;

  @ApiProperty({ enum: ClickUpLinkTarget })
  targetType: ClickUpLinkTarget;

  @ApiProperty()
  targetId: string;

  @ApiProperty({ description: '"" for an issue.' })
  roadmapId: string;

  @ApiProperty()
  taskName: string;

  @ApiProperty({ description: 'Deep link back into ClickUp.' })
  taskUrl: string;

  @ApiProperty({ example: 'DEV-123', description: '"" unless the workspace uses custom ids.' })
  customId: string;

  @ApiProperty({ example: 'in progress' })
  status: string;

  @ApiProperty({ example: '#4194f6', description: 'ClickUp’s colour for that status.' })
  statusColor: string;

  @ApiProperty({ example: 'custom', description: 'open · custom · done · closed' })
  statusType: string;

  @ApiProperty({ type: [String] })
  assignees: string[];

  @ApiProperty({ example: 'high', description: '"" when the task has no priority.' })
  priority: string;

  @ApiProperty({ example: '2026-08-14', description: '"" when the task has no due date.' })
  dueDate: string;

  @ApiProperty()
  listName: string;

  @ApiProperty()
  spaceName: string;

  @ApiProperty({
    description: '"" when healthy; otherwise why the mirror stopped (deleted, no access).',
  })
  unavailableReason: string;

  @ApiProperty()
  createdByName: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ description: 'When the mirror was last refreshed from ClickUp.' })
  lastSyncedAt: string;
}

/**
 * The ClickUp connection as Settings sees it.
 *
 * No `apiToken` field exists on this type at all — not masked, absent. A field
 * that is sometimes a credential is one refactor away from always being one.
 */
export class ClickUpSettingsResponseDto {
  @ApiProperty({ description: 'false → nothing else on this object is meaningful.' })
  connected: boolean;

  @ApiProperty({ description: 'Last 4 characters of the stored token, or "".' })
  tokenPreview: string;

  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  workspaceName: string;

  @ApiProperty({ description: 'Where ClickUp posts. Shown so an admin can verify it in ClickUp.' })
  webhookUrl: string;

  @ApiProperty({
    description: 'false when webhook registration failed — links then refresh manually only.',
  })
  webhookActive: boolean;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  connectedAt: string;

  @ApiProperty({ description: '"" until the first delivery lands.' })
  lastEventAt: string;

  @ApiProperty({ example: 'Fix login · in progress · 2 links updated' })
  lastEventSummary: string;
}

/**
 * "Can I link a ClickUp task?" — the non-admin half of the settings object.
 *
 * A deliberately separate, deliberately tiny type. Anyone who can edit an issue
 * needs this to decide whether to offer the Link button, and the way to let a
 * developer read it without letting them read the connection is to make the
 * thing they read contain nothing else.
 */
export class ClickUpStatusResponseDto {
  @ApiProperty({ description: 'Connected AND enabled — i.e. linking will work.' })
  available: boolean;

  @ApiProperty({ description: 'Shown beside the Link button so people know where it points.' })
  workspaceName: string;
}

/** One workspace a pasted token can see, for the connect form's picker. */
export class ClickUpWorkspaceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'ClickUp’s avatar colour. "" if unset.' })
  color: string;
}
