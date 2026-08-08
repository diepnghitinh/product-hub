import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ClickUpLinkOrigin,
  ClickUpLinkTarget,
  ClickUpSyncScope,
} from '@application/app-settings/domain/clickup.types';

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

/**
 * Which record something is being asked about — no verb of its own.
 *
 * One class for the push body and the push-target query because they are the
 * same question asked twice ("this record, in ClickUp"), once before the button
 * is drawn and once when it's pressed. Two identical DTOs would drift.
 */
export class ClickUpTargetDto {
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

/**
 * Whether this record can be created in ClickUp on demand.
 *
 * Tiny for the same reason `ClickUpStatusResponseDto` is: it's read by anyone
 * who can edit an issue, purely to decide whether to offer a button, and the way
 * to let a developer read that without letting them read a customer's ClickUp
 * layout is to make the thing they read contain nothing else.
 */
export class ClickUpPushTargetResponseDto {
  @ApiProperty({
    description: 'true → this record’s board is bound, syncing is on, and nothing is synced yet.',
  })
  canPush: boolean;

  @ApiProperty({ description: 'The list it would land in. "" whenever canPush is false.' })
  listName: string;
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

  @ApiProperty({
    enum: ClickUpLinkOrigin,
    description:
      'manual = pasted, read-only, unlinkable. sync = created by a bound board, ' +
      'kept in step both ways, and unlinked by unbinding the board.',
  })
  origin: ClickUpLinkOrigin;

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

// ─── binding a board to a list ──────────────────────────────────────────────

/** One space in the connected workspace, for the binding form's first picker. */
export class ClickUpSpaceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

/** One list a board can be bound to. Flattened — see `ClickUpList`. */
export class ClickUpListResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description: '"" for a folderless list; shown to tell two same-named lists apart.',
  })
  folderName: string;
}

/** One status the bound list defines — the right-hand side of the mapping form. */
export class ClickUpListStatusResponseDto {
  @ApiProperty({ example: 'in progress' })
  name: string;

  @ApiProperty({ example: '#4194f6' })
  color: string;

  @ApiProperty({ example: 'custom', description: 'open · custom · done · closed' })
  type: string;
}

/** One row of the mapping form: our column → their status. */
export class ClickUpStatusPairDto {
  @ApiProperty({ description: 'Our column key — a team status key or a roadmap column key.' })
  @IsString()
  @MaxLength(64)
  key: string;

  @ApiProperty({ description: 'ClickUp’s status name. "" means this column does not sync.' })
  @IsString()
  @MaxLength(200)
  clickupStatus: string;
}

/**
 * Bind a board to a ClickUp list, or re-save its mapping.
 *
 * The scope and its id ride in the URL, not here — one board has one binding, so
 * the thing being edited is identified by where it is, not by what's in the body.
 */
export class SaveClickUpSyncDto {
  @ApiProperty({ example: '901234567', description: 'The ClickUp list every task lands in.' })
  @IsString()
  @MaxLength(64)
  listId: string;

  @ApiProperty({ required: false, description: 'Display name, so settings can name it offline.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  listName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  spaceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  spaceName?: string;

  @ApiProperty({ description: 'Off keeps the mapping but stops every push and inbound move.' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    type: [ClickUpStatusPairDto],
    description: 'One row per board column. A row left blank means that column does not sync.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClickUpStatusPairDto)
  statusMap: ClickUpStatusPairDto[];
}

/**
 * A board's binding, as its settings form sees it.
 *
 * `statusMap` is always reconciled against the board's *current* columns before
 * it goes out, so the form shows today's columns even if someone added one after
 * the mapping was last saved.
 */
export class ClickUpSyncResponseDto {
  @ApiProperty({ description: 'false → nothing else here is meaningful; the board is unbound.' })
  bound: boolean;

  @ApiProperty({ enum: ClickUpSyncScope })
  scope: ClickUpSyncScope;

  @ApiProperty()
  scopeId: string;

  @ApiProperty()
  listId: string;

  @ApiProperty()
  listName: string;

  @ApiProperty()
  spaceId: string;

  @ApiProperty()
  spaceName: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: [ClickUpStatusPairDto] })
  statusMap: ClickUpStatusPairDto[];

  @ApiProperty({
    type: [ClickUpListStatusResponseDto],
    description: 'What the bound list offers, so the form can render a real picker per row.',
  })
  listStatuses: ClickUpListStatusResponseDto[];

  @ApiProperty({
    description: 'Our columns, in board order, so the form labels each row without a second call.',
    example: [{ key: 'in-progress', label: 'In progress' }],
  })
  columns: { key: string; label: string }[];
}

/** Pin one of our people to one ClickUp member. `memberId: 0` clears the pin. */
export class ClickUpUserPairDto {
  @ApiProperty({ description: 'Our User.id.' })
  @IsString()
  @MaxLength(64)
  userId: string;

  @ApiProperty({
    description: 'ClickUp’s numeric member id. 0 removes the pin and restores the email match.',
    example: 4812345,
  })
  @IsInt()
  @Min(0)
  memberId: number;
}

/** Replace the whole people map. Rows with `memberId: 0` are dropped, not stored. */
export class SaveClickUpPeopleDto {
  @ApiProperty({ type: [ClickUpUserPairDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClickUpUserPairDto)
  people: ClickUpUserPairDto[];
}

/**
 * One row of the people table: one of our users, and who they reach in ClickUp.
 *
 * Deliberately flat and self-explaining, because the honest answer to "does this
 * person sync?" has three shapes and the UI must tell them apart:
 *
 * - `pinned: true`  — an admin chose this pairing; `memberId` is what gets used.
 * - `pinned: false` and `memberId > 0` — nobody configured anything, the emails
 *   simply match. Shown as the resolved default so the row reads honestly.
 * - `memberId: 0`   — nothing matches. Assigning this person pushes nobody, and
 *   this is the row the whole screen exists to make visible.
 */
export class ClickUpPersonResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  avatarUrl: string;

  @ApiProperty({ description: '0 when nothing matches — this person’s assignments do not sync.' })
  memberId: number;

  @ApiProperty({ description: 'ClickUp’s display name for the matched member, or "".' })
  clickupUsername: string;

  @ApiProperty({ description: 'ClickUp’s email for the matched member, or "".' })
  clickupEmail: string;

  @ApiProperty({ description: 'true → chosen by an admin. false → matched on email.' })
  pinned: boolean;
}

/** One seat in the connected ClickUp workspace — an option a row can be pinned to. */
export class ClickUpMemberResponseDto {
  @ApiProperty({ example: 4812345 })
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;
}

/** The people screen: our side, ClickUp's side, and how they currently resolve. */
export class ClickUpPeopleResponseDto {
  @ApiProperty({ type: [ClickUpPersonResponseDto] })
  people: ClickUpPersonResponseDto[];

  @ApiProperty({
    type: [ClickUpMemberResponseDto],
    description: 'Everyone with a seat in the workspace — the options each row can be pinned to.',
  })
  members: ClickUpMemberResponseDto[];

  @ApiProperty({
    description: 'ClickUp unreachable → members is empty and the saved pins still render.',
  })
  membersUnavailable: string;
}
