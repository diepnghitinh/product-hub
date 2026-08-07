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
  LinkClickUpTaskUseCase,
  RefreshClickUpLinkUseCase,
  UnlinkClickUpTaskUseCase,
} from '@application/integrations/use-cases/clickup.use-cases';
import {
  ClickUpLinkResponseDto,
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
    summary: 'Remove a link',
    description: 'The ClickUp task is untouched — this integration never writes there.',
  })
  async del(@AuthUser() auth: JwtPayload, @Param('id') id: string): Promise<{ ok: boolean }> {
    const result = await this.unlink.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return { ok: true };
  }
}
