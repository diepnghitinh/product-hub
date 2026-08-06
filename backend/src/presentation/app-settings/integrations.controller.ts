import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

/**
 * Settings → Integrations. Admin-only: these routes hand back the signing
 * secret, which is the whole of an integration's authentication.
 */
@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings/integrations')
export class IntegrationsController {
  private readonly apiBaseUrl: string;

  constructor(
    config: ConfigService,
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly saveIntegration: SaveIntegrationUseCase,
    private readonly rotate: RotateIntegrationSecretUseCase,
    private readonly remove: DeleteIntegrationUseCase,
  ) {
    this.apiBaseUrl = (config.get<string>('API_BASE_URL') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  /**
   * The URL an admin pastes into the repo. Built from `API_BASE_URL` rather than
   * the incoming request: behind a proxy the Host header is whatever the proxy
   * chose to forward, and a *wrong* URL here fails silently — the admin pastes
   * it, nothing ever arrives, and there's nothing on either screen to say why.
   */
  private present(i: GitIntegrationConfig): IntegrationResponseDto {
    return {
      id: i.id,
      provider: i.provider,
      name: i.name,
      webhookUrl: `${this.apiBaseUrl}/v1/public/git/${i.token}`,
      secret: i.secret,
      enabled: i.enabled,
      createdAt: i.createdAt,
      lastEventAt: i.lastEventAt,
      lastEventSummary: i.lastEventSummary,
    };
  }

  private list(s: AppSettingsEntity): IntegrationResponseDto[] {
    return s.integrations.map((i) => this.present(i));
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Connected GitHub / GitLab repos (admin)' })
  async get(@AuthUser() auth: JwtPayload): Promise<IntegrationResponseDto[]> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return this.list(result.getValue());
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add or edit a connected repo (admin)' })
  async put(
    @AuthUser() auth: JwtPayload,
    @Body() dto: SaveIntegrationDto,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.saveIntegration.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return this.list(result.getValue().settings);
  }

  @Post(':id/rotate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mint a new URL token + secret for one repo (admin)' })
  async rotateSecret(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.rotate.execute({ tenantId: auth.tenantId, id });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return this.list(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disconnect a repo (admin)' })
  async del(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<IntegrationResponseDto[]> {
    const result = await this.remove.execute({ tenantId: auth.tenantId, id });
    return this.list(result.getValue());
  }
}
