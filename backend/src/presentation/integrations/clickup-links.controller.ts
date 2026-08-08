import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import {
  GetClickUpLinksUseCase,
  GetClickUpPushTargetUseCase,
  LinkClickUpTaskUseCase,
  PushClickUpTaskUseCase,
  RefreshClickUpLinkUseCase,
  UnlinkClickUpTaskUseCase,
} from '@application/integrations/use-cases/clickup.use-cases';
import {
  ClickUpLinkResponseDto,
  ClickUpPushTargetResponseDto,
  ClickUpTargetDto,
  GetClickUpLinksQueryDto,
  LinkClickUpTaskDto,
} from '@application/integrations/dtos/clickup.dtos';
import { ClickUpLinkRecord } from '@application/integrations/repositories/clickup-link.repository';

/** The stored link, flattened for the wire. Never carries the API token. */
function present(l: ClickUpLinkRecord): ClickUpLinkResponseDto {
  return {
    id: l.id,
    clickupTaskId: l.clickupTaskId,
    targetType: l.targetType,
    targetId: l.targetId,
    roadmapId: l.roadmapId,
    origin: l.origin,
    taskName: l.taskName,
    taskUrl: l.taskUrl,
    customId: l.customId,
    status: l.status,
    statusColor: l.statusColor,
    statusType: l.statusType,
    assignees: l.assignees,
    priority: l.priority,
    dueDate: l.dueDate,
    listName: l.listName,
    spaceName: l.spaceName,
    unavailableReason: l.unavailableReason,
    createdByName: l.createdByName,
    createdAt: l.createdAt.toISOString(),
    lastSyncedAt: l.lastSyncedAt.toISOString(),
  };
}

/**
 * Linking ClickUp tasks to issues and backlog items.
 *
 * Open to everyone who can edit work, not just admins: linking is an ordinary
 * part of working an issue. Connecting the workspace stays admin-only — that's
 * where the credential is.
 */
@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Controller('clickup/links')
export class ClickUpLinksController {
  constructor(
    private readonly getLinks: GetClickUpLinksUseCase,
    private readonly link: LinkClickUpTaskUseCase,
    private readonly unlink: UnlinkClickUpTaskUseCase,
    private readonly refresh: RefreshClickUpLinkUseCase,
    private readonly pushTarget: GetClickUpPushTargetUseCase,
    private readonly push: PushClickUpTaskUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'ClickUp tasks linked to one issue or backlog item',
    description: 'A mirrored snapshot, not a live read — `lastSyncedAt` says how fresh it is.',
  })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: GetClickUpLinksQueryDto,
  ): Promise<ClickUpLinkResponseDto[]> {
    const result = await this.getLinks.execute({
      tenantId: auth.tenantId,
      targetType: query.targetType,
      targetId: query.targetId,
    });
    return result.getValue().map(present);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Link a ClickUp task to an issue or backlog item',
    description:
      'Accepts a task URL, a task id, or a custom id (DEV-123). Reads the task ' +
      'immediately so a wrong link fails now rather than staying silently empty.',
  })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: LinkClickUpTaskDto,
  ): Promise<ClickUpLinkResponseDto> {
    const result = await this.link.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      userName: auth.name,
      dto,
    });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return present(result.getValue());
  }

  @Get('push-target')
  @ApiOperation({
    summary: 'Can this record be created in ClickUp on demand?',
    description:
      'Answers false — never an error — for every ordinary reason: no ClickUp, an ' +
      'unbound board, a personal task, or a record that already syncs. Readable by ' +
      'anyone who can edit an issue; it says nothing about the workspace’s layout.',
  })
  async canPush(
    @AuthUser() auth: JwtPayload,
    @Query() query: ClickUpTargetDto,
  ): Promise<ClickUpPushTargetResponseDto> {
    const result = await this.pushTarget.execute({
      tenantId: auth.tenantId,
      targetType: query.targetType,
      targetId: query.targetId,
      roadmapId: query.roadmapId,
    });
    return result.getValue();
  }

  @Post('push')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Create this record in ClickUp now, through its board’s binding',
    description:
      'For work that predates the binding. Runs the exact write an ordinary save ' +
      'would have run, so the result is a normal synced link — pushed out, status ' +
      'coming back, and unlinked only by unbinding the board.',
  })
  async pushOne(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ClickUpTargetDto,
  ): Promise<ClickUpLinkResponseDto> {
    const result = await this.push.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return present(result.getValue());
  }

  @Post(':id/refresh')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Re-read one linked task from ClickUp now',
    description:
      'The escape hatch for a webhook that never arrived. Same work the event ' +
      'handler does, so it converges to the same state.',
  })
  async refreshOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<ClickUpLinkResponseDto> {
    const result = await this.refresh.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return present(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Remove a pasted link',
    description:
      'The ClickUp task is untouched — nothing here ever deletes one. Rejects a ' +
      'link a bound board created: that one is unlinked by unbinding the board.',
  })
  async del(@AuthUser() auth: JwtPayload, @Param('id') id: string): Promise<{ ok: boolean }> {
    const result = await this.unlink.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return { ok: true };
  }
}
