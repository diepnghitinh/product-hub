import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import {
  GetAppSettingsUseCase,
  UpdateBugStatusesUseCase,
  UpdateWebhooksUseCase,
} from '@application/app-settings/use-cases/app-settings.use-cases';
import {
  AppSettingsResponseDto,
  UpdateBugStatusesDto,
  UpdateWebhooksDto,
} from '@application/app-settings/dtos/app-settings.dtos';

@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings')
export class AppSettingsController {
  constructor(
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly updateWebhooks: UpdateWebhooksUseCase,
    private readonly updateBugStatuses: UpdateBugStatusesUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get tenant settings (admin)' })
  async get(@AuthUser() auth: JwtPayload): Promise<AppSettingsResponseDto> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    const s = result.getValue();
    return { tenantId: s.tenantId, webhooks: s.webhooks, bugStatuses: s.bugStatuses };
  }

  @Get('bug-statuses')
  @ApiOperation({ summary: 'Get the tenant bug board columns (any authenticated user)' })
  async getBugStatuses(@AuthUser() auth: JwtPayload): Promise<BugStatusConfig[]> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return result.getValue().bugStatuses;
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
    return { tenantId: s.tenantId, webhooks: s.webhooks, bugStatuses: s.bugStatuses };
  }

  @Put('bug-statuses')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename / recolor / reorder the bug board columns (admin)' })
  async putBugStatuses(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateBugStatusesDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateBugStatuses.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) {
      throw new BadRequestException(result.error as string);
    }
    const s = result.getValue();
    return { tenantId: s.tenantId, webhooks: s.webhooks, bugStatuses: s.bugStatuses };
  }
}
