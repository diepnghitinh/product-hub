import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { ClickUpSyncScope } from '@application/app-settings/domain/clickup.types';
import {
  DeleteClickUpSyncUseCase,
  GetClickUpListsUseCase,
  GetClickUpListStatusesUseCase,
  GetClickUpSpacesUseCase,
  GetClickUpSyncUseCase,
  SaveClickUpSyncUseCase,
  ClickUpSyncView,
} from '@application/integrations/use-cases/clickup-sync.use-cases';
import {
  ClickUpListResponseDto,
  ClickUpListStatusResponseDto,
  ClickUpSpaceResponseDto,
  ClickUpSyncResponseDto,
  SaveClickUpSyncDto,
} from '@application/integrations/dtos/clickup.dtos';

/** The binding as its form sees it. Flat, and never carrying the API token. */
function present(
  scope: ClickUpSyncScope,
  scopeId: string,
  view: ClickUpSyncView,
): ClickUpSyncResponseDto {
  const b = view.binding;
  return {
    bound: !!b,
    scope,
    scopeId,
    listId: b?.listId ?? '',
    listName: b?.listName ?? '',
    spaceId: b?.spaceId ?? '',
    spaceName: b?.spaceName ?? '',
    enabled: b?.enabled ?? false,
    statusMap: view.statusMap,
    listStatuses: view.listStatuses.map((s) => ({ name: s.name, color: s.color, type: s.type })),
    columns: view.columns,
  };
}

/**
 * Binding a team's board or a roadmap's backlog to a ClickUp list.
 *
 * **Admin-only, all of it** — including the read. Unlike linking a single task
 * (which anyone working an issue can do), a binding decides where every issue on
 * a board is mirrored, and reading one exposes the shape of a customer's ClickUp
 * workspace. It belongs with the other things only an admin can see.
 *
 * The scope and its id ride in the path (`/clickup/sync/team/:id`) because one
 * board has exactly one binding — the resource *is* the board's binding, so
 * there's nothing to identify in a body.
 */
@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Roles(Role.ADMIN)
@Controller('clickup/sync')
export class ClickUpSyncController {
  constructor(
    private readonly getSpaces: GetClickUpSpacesUseCase,
    private readonly getLists: GetClickUpListsUseCase,
    private readonly getStatuses: GetClickUpListStatusesUseCase,
    private readonly getSync: GetClickUpSyncUseCase,
    private readonly saveSync: SaveClickUpSyncUseCase,
    private readonly deleteSync: DeleteClickUpSyncUseCase,
  ) {}

  @Get('spaces')
  @ApiOperation({
    summary: 'Spaces in the connected ClickUp workspace',
    description:
      'The first picker of the binding form. Fails plainly when ClickUp isn’t connected.',
  })
  async spaces(@AuthUser() auth: JwtPayload): Promise<ClickUpSpaceResponseDto[]> {
    const result = await this.getSpaces.execute({ tenantId: auth.tenantId });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return result.getValue();
  }

  @Get('lists')
  @ApiOperation({
    summary: 'Lists in one space',
    description:
      'Flattened across folders — the question being asked is "which list?", and ' +
      'a two-level cascade to answer it is three clicks where one will do.',
  })
  async lists(
    @AuthUser() auth: JwtPayload,
    @Query('spaceId') spaceId: string,
  ): Promise<ClickUpListResponseDto[]> {
    const result = await this.getLists.execute({ tenantId: auth.tenantId, spaceId });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return result.getValue();
  }

  @Get(':scope/:scopeId/statuses')
  @ApiOperation({
    summary: 'A list’s statuses, plus a suggested mapping onto this board',
    description:
      'Called when an admin picks a list, before saving. The suggestion matches on ' +
      'name, then synonyms, then the ends of both boards — and leaves anything it ' +
      'isn’t sure about blank rather than guessing.',
  })
  async statuses(
    @AuthUser() auth: JwtPayload,
    @Param('scope', new ParseEnumPipe(ClickUpSyncScope)) scope: ClickUpSyncScope,
    @Param('scopeId') scopeId: string,
    @Query('listId') listId: string,
  ): Promise<{
    statuses: ClickUpListStatusResponseDto[];
    suggested: { key: string; clickupStatus: string }[];
  }> {
    const result = await this.getStatuses.execute({
      tenantId: auth.tenantId,
      scope,
      scopeId,
      listId,
    });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    const { statuses, suggested } = result.getValue();
    return {
      statuses: statuses.map((s) => ({ name: s.name, color: s.color, type: s.type })),
      suggested,
    };
  }

  @Get(':scope/:scopeId')
  @ApiOperation({
    summary: 'One board’s ClickUp binding',
    description:
      'The status map comes back reconciled against the board’s *current* columns, ' +
      'so a column added since the last save shows as an empty row rather than not at all.',
  })
  async get(
    @AuthUser() auth: JwtPayload,
    @Param('scope', new ParseEnumPipe(ClickUpSyncScope)) scope: ClickUpSyncScope,
    @Param('scopeId') scopeId: string,
  ): Promise<ClickUpSyncResponseDto> {
    const result = await this.getSync.execute({ tenantId: auth.tenantId, scope, scopeId });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return present(scope, scopeId, result.getValue());
  }

  @Put(':scope/:scopeId')
  @ApiOperation({
    summary: 'Bind this board to a ClickUp list',
    description:
      'Reads the list first, so a wrong list or a revoked token fails here rather ' +
      'than silently, one failed push at a time, for a week.',
  })
  async save(
    @AuthUser() auth: JwtPayload,
    @Param('scope', new ParseEnumPipe(ClickUpSyncScope)) scope: ClickUpSyncScope,
    @Param('scopeId') scopeId: string,
    @Body() dto: SaveClickUpSyncDto,
  ): Promise<ClickUpSyncResponseDto> {
    const result = await this.saveSync.execute({ tenantId: auth.tenantId, scope, scopeId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return present(scope, scopeId, result.getValue());
  }

  @Delete(':scope/:scopeId')
  @ApiOperation({
    summary: 'Unbind this board',
    description:
      'Stops the sync. The ClickUp tasks and the links beside each record stay, so ' +
      're-binding the same list picks up exactly where it left off.',
  })
  async del(
    @AuthUser() auth: JwtPayload,
    @Param('scope', new ParseEnumPipe(ClickUpSyncScope)) scope: ClickUpSyncScope,
    @Param('scopeId') scopeId: string,
  ): Promise<{ ok: boolean }> {
    await this.deleteSync.execute({ tenantId: auth.tenantId, scope, scopeId });
    return { ok: true };
  }
}
