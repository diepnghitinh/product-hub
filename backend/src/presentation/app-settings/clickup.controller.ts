import { BadRequestException, Body, Controller, Delete, Get, Post, Put, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { GetAppSettingsUseCase } from '@application/app-settings/use-cases/app-settings.use-cases';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { tokenPreview } from '@application/app-settings/domain/clickup.types';
import {
  ConnectClickUpUseCase,
  DisconnectClickUpUseCase,
  ProbeClickUpUseCase,
  SetClickUpEnabledUseCase,
} from '@application/integrations/use-cases/clickup.use-cases';
import {
  ClickUpSettingsResponseDto,
  ClickUpStatusResponseDto,
  ClickUpWorkspaceResponseDto,
  ConnectClickUpDto,
  ProbeClickUpDto,
  UpdateClickUpDto,
} from '@application/integrations/dtos/clickup.dtos';
import { normaliseBaseUrl, publicOriginFor } from './public-origin';

/**
 * Settings → ClickUp. Admin-only, because connecting stores an API token that
 * can read every task the person who made it can see.
 *
 * The token goes in and never comes out: `present()` below has no branch that
 * can emit it, only `tokenPreview`. That's why connecting sends it again rather
 * than the UI round-tripping what it was handed.
 */
@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings/clickup')
export class ClickUpController {
  private readonly configuredBaseUrl: string;

  constructor(
    config: ConfigService,
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly probe: ProbeClickUpUseCase,
    private readonly connect: ConnectClickUpUseCase,
    private readonly setEnabled: SetClickUpEnabledUseCase,
    private readonly disconnect: DisconnectClickUpUseCase,
  ) {
    this.configuredBaseUrl = normaliseBaseUrl(config.get<string>('API_BASE_URL'));
  }

  private present(s: AppSettingsEntity, req: Request): ClickUpSettingsResponseDto {
    const c = s.clickup;
    if (!c) {
      return {
        connected: false,
        tokenPreview: '',
        workspaceId: '',
        workspaceName: '',
        webhookUrl: '',
        webhookActive: false,
        enabled: false,
        connectedAt: '',
        lastEventAt: '',
        lastEventSummary: '',
      };
    }
    return {
      connected: true,
      tokenPreview: tokenPreview(c.apiToken),
      workspaceId: c.workspaceId,
      workspaceName: c.workspaceName,
      webhookUrl: `${publicOriginFor(req, this.configuredBaseUrl)}/v1/public/clickup/${c.urlToken}`,
      webhookActive: Boolean(c.webhookId),
      enabled: c.enabled,
      connectedAt: c.connectedAt,
      lastEventAt: c.lastEventAt,
      lastEventSummary: c.lastEventSummary,
    };
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'The connected ClickUp workspace (admin)' })
  async get(
    @AuthUser() auth: JwtPayload,
    @Req() req: Request,
  ): Promise<ClickUpSettingsResponseDto> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return this.present(result.getValue(), req);
  }

  /**
   * No `@Roles` on purpose — anyone who can edit an issue can link a ClickUp
   * task, so everyone needs to know whether that button should exist. It answers
   * two harmless facts and nothing else; the connection itself stays behind
   * `GET /settings/clickup`, which is admin-only.
   */
  @Get('status')
  @ApiOperation({ summary: 'Is ClickUp linking available? (any authenticated user)' })
  async status(@AuthUser() auth: JwtPayload): Promise<ClickUpStatusResponseDto> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    const c = result.getValue().clickup;
    return {
      available: Boolean(c?.enabled),
      workspaceName: c?.workspaceName ?? '',
    };
  }

  @Post('probe')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Check a ClickUp token and list the workspaces it can see (admin)',
    description: 'Persists nothing — a token that fails here leaves no trace.',
  })
  async probeToken(@Body() dto: ProbeClickUpDto): Promise<ClickUpWorkspaceResponseDto[]> {
    const result = await this.probe.execute({ dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return result.getValue();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Connect a ClickUp workspace and register its webhook (admin)' })
  async post(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ConnectClickUpDto,
    @Req() req: Request,
  ): Promise<ClickUpSettingsResponseDto & { webhookWarning: string }> {
    const result = await this.connect.execute({
      tenantId: auth.tenantId,
      dto,
      webhookBase: publicOriginFor(req, this.configuredBaseUrl),
    });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    const { settings, webhookWarning } = result.getValue();
    // The warning rides along rather than throwing: the connection *did* save,
    // and the UI needs to say "connected, but live updates are off" — which is a
    // different sentence from "connecting failed".
    return { ...this.present(settings, req), webhookWarning };
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Pause or resume the ClickUp mirror (admin)' })
  async put(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateClickUpDto,
    @Req() req: Request,
  ): Promise<ClickUpSettingsResponseDto> {
    const result = await this.setEnabled.execute({
      tenantId: auth.tenantId,
      enabled: dto.enabled,
    });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return this.present(result.getValue(), req);
  }

  @Delete()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Disconnect ClickUp (admin)',
    description: 'Deletes the webhook in ClickUp, drops the token, and removes every link.',
  })
  async del(
    @AuthUser() auth: JwtPayload,
    @Req() req: Request,
  ): Promise<ClickUpSettingsResponseDto> {
    const result = await this.disconnect.execute({ tenantId: auth.tenantId });
    return this.present(result.getValue(), req);
  }
}
