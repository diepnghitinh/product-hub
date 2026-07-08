import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import {
  GetAppSettingsUseCase,
  UpdateWebhooksUseCase,
} from '@application/app-settings/use-cases/app-settings.use-cases';
import {
  AppSettingsResponseDto,
  UpdateWebhooksDto,
} from '@application/app-settings/dtos/app-settings.dtos';

@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings')
export class AppSettingsController {
  constructor(
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly updateWebhooks: UpdateWebhooksUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get tenant settings (admin)' })
  async get(@AuthUser() auth: JwtPayload): Promise<AppSettingsResponseDto> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    const s = result.getValue();
    return { tenantId: s.tenantId, webhooks: s.webhooks };
  }

  @Put('webhooks')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Replace webhook configuration (admin)' })
  async putWebhooks(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateWebhooksDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateWebhooks.execute({ tenantId: auth.tenantId, dto });
    const s = result.getValue();
    return { tenantId: s.tenantId, webhooks: s.webhooks };
  }
}
