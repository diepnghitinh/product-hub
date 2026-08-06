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

/** Last resort only: a request with no Host header at all can't happen over HTTP/1.1. */
const NO_HOST_FALLBACK = 'http://localhost:3000';

/** First value of a header that may arrive repeated or comma-joined ("a, b"). */
const firstValue = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() ?? '';

/** Loopback / private / .local — an address only this network can dial. */
const isLocalHost = (hostHeader: string): boolean => {
  const host = hostHeader
    .replace(/:\d+$/, '')
    .replace(/^\[|]$/g, '')
    .toLowerCase();
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
};

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
    this.configuredBaseUrl = (config.get<string>('API_BASE_URL') ?? '').trim().replace(/\/+$/, '');
  }

  /**
   * Public origin of this API — the half of the webhook URL that has to be
   * reachable from GitHub/GitLab.
   *
   * `API_BASE_URL` wins when it's set, and it's the only way to describe an odd
   * topology. But it usually *isn't* set: the runtime image ships no env file
   * (`backend/.dockerignore` drops them), so every deployment supplies its own
   * variables — and the one nobody knew to add silently stayed the old
   * `http://localhost:3000` default. That URL fails in the worst way: it looks
   * like a real value, and GitLab refuses it outright ("Url is blocked:
   * Requests to localhost are not allowed").
   *
   * So the fallback is the address this very request arrived on. Behind a proxy
   * that lives in `X-Forwarded-*`, and whatever it says, it is by definition an
   * address that just reached us from outside — which is exactly the property
   * the webhook URL needs.
   */
  private originFor(req: Request): string {
    if (this.configuredBaseUrl) return this.configuredBaseUrl;

    const host = firstValue(req.headers['x-forwarded-host']) || req.headers.host || '';
    if (!host) return NO_HOST_FALLBACK;

    // A public host is https in practice: TLS terminates at the edge, and the
    // proxy may forward the *internal* hop's scheme instead (Traefik on an http
    // entrypoint behind Cloudflare does exactly that). Handing back an http URL
    // there would put every payload — and the signing secret — on the wire in
    // the clear. Local and private hosts keep the scheme they arrived with.
    const proto = firstValue(req.headers['x-forwarded-proto']) || req.protocol || 'http';
    return `${isLocalHost(host) ? proto : 'https'}://${host}`;
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
