import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { GetAppSettingsUseCase } from '@application/app-settings/use-cases/app-settings.use-cases';
import { GitIntegrationConfig } from '@application/app-settings/domain/integration.types';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import {
  DeleteIntegrationUseCase,
  RotateIntegrationSecretUseCase,
  SaveIntegrationUseCase,
} from '@application/integrations/use-cases/integration.use-cases';
import {
  IntegrationResponseDto,
  SaveIntegrationDto,
} from '@application/integrations/dtos/integration.dtos';
import { normaliseBaseUrl, publicOriginFor } from './public-origin';

/**
 * Settings → Integrations. Admin-only: these routes hand back the signing
 * secret, which is the whole of an integration's authentication.
 */
@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings/integrations')
export class IntegrationsController {
  private readonly configuredBaseUrl: string;

  constructor(
    config: ConfigService,
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly saveIntegration: SaveIntegrationUseCase,
    private readonly rotate: RotateIntegrationSecretUseCase,
    private readonly remove: DeleteIntegrationUseCase,
  ) {
    this.configuredBaseUrl = normaliseBaseUrl(config.get<string>('API_BASE_URL'));
  }

  private originFor(req: Request): string {
    return publicOriginFor(req, this.configuredBaseUrl);
  }

  /** The URL an admin pastes into the repo, against this request's origin. */
  private present(i: GitIntegrationConfig, origin: string): IntegrationResponseDto {
    return {
      id: i.id,
      provider: i.provider,
      name: i.name,
      webhookUrl: `${origin}/v1/public/git/${i.token}`,
      secret: i.secret,
      enabled: i.enabled,
      createdAt: i.createdAt,
      lastEventAt: i.lastEventAt,
      lastEventSummary: i.lastEventSummary,
    };
  }

  private list(s: AppSettingsEntity, req: Request): IntegrationResponseDto[] {
    const origin = this.originFor(req);
    return s.integrations.map((i) => this.present(i, origin));
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Connected GitHub / GitLab repos (admin)' })
  async get(@AuthUser() auth: JwtPayload, @Req() req: Request): Promise<IntegrationResponseDto[]> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return this.list(result.getValue(), req);
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add or edit a connected repo (admin)' })
  async put(
    @AuthUser() auth: JwtPayload,
    @Body() dto: SaveIntegrationDto,
    @Req() req: Request,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.saveIntegration.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return this.list(result.getValue().settings, req);
  }

  @Post(':id/rotate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mint a new URL token + secret for one repo (admin)' })
  async rotateSecret(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.rotate.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return this.list(result.getValue(), req);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disconnect a repo (admin)' })
  async del(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.remove.execute({ tenantId: auth.tenantId, id });
    return this.list(result.getValue(), req);
  }
}
