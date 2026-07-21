import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { BugStatusConfig } from '@application/bugs/domain/enums/bug.enums';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';
import {
  GetAppSettingsUseCase,
  UpdateBugStatusesUseCase,
  UpdateStorageUseCase,
  UpdateTaskStatusesUseCase,
  UpdateWebhooksUseCase,
} from '@application/app-settings/use-cases/app-settings.use-cases';
import {
  AppSettingsResponseDto,
  StorageSettingsResponseDto,
  UpdateBugStatusesDto,
  UpdateStorageDto,
  UpdateTaskStatusesDto,
  UpdateWebhooksDto,
} from '@application/app-settings/dtos/app-settings.dtos';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { CloudStorageConfig } from '@application/app-settings/domain/storage.types';

@ApiTags('Settings')
@ApiBearerAuth('JWT-auth')
@Controller('settings')
export class AppSettingsController {
  constructor(
    private readonly getSettings: GetAppSettingsUseCase,
    private readonly updateWebhooks: UpdateWebhooksUseCase,
    private readonly updateBugStatuses: UpdateBugStatusesUseCase,
    private readonly updateTaskStatuses: UpdateTaskStatusesUseCase,
    private readonly updateStorage: UpdateStorageUseCase,
  ) {}

  /** Storage secrets never leave the server — collapse them to booleans. */
  private maskStorage(c: CloudStorageConfig): StorageSettingsResponseDto {
    return {
      provider: c.provider,
      s3Region: c.s3Region,
      s3Bucket: c.s3Bucket,
      s3AccessKeyId: c.s3AccessKeyId,
      s3Endpoint: c.s3Endpoint,
      s3PublicBaseUrl: c.s3PublicBaseUrl,
      s3SecretConfigured: !!c.s3SecretAccessKey,
      azureContainer: c.azureContainer,
      azureConnectionConfigured: !!c.azureConnectionString,
      maxVideoMb: c.maxVideoMb,
      maxImageMb: c.maxImageMb,
    };
  }

  /** The full settings blob, with storage secrets masked. */
  private present(s: AppSettingsEntity): AppSettingsResponseDto {
    return {
      tenantId: s.tenantId,
      webhooks: s.webhooks,
      bugStatuses: s.bugStatuses,
      taskStatuses: s.taskStatuses,
      storage: this.maskStorage(s.storage),
    };
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get tenant settings (admin)' })
  async get(@AuthUser() auth: JwtPayload): Promise<AppSettingsResponseDto> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return this.present(result.getValue());
  }

  @Get('bug-statuses')
  @ApiOperation({ summary: 'Get the tenant bug board columns (any authenticated user)' })
  async getBugStatuses(@AuthUser() auth: JwtPayload): Promise<BugStatusConfig[]> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return result.getValue().bugStatuses;
  }

  @Get('task-statuses')
  @ApiOperation({ summary: 'Get the tenant task board columns (any authenticated user)' })
  async getTaskStatuses(@AuthUser() auth: JwtPayload): Promise<TaskStatusConfig[]> {
    const result = await this.getSettings.execute({ tenantId: auth.tenantId });
    return result.getValue().taskStatuses;
  }

  @Put('webhooks')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Replace webhook configuration (admin)' })
  async putWebhooks(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateWebhooksDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateWebhooks.execute({ tenantId: auth.tenantId, dto });
    return this.present(result.getValue());
  }

  @Put('bug-statuses')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename / recolor / reorder / add bug board columns (admin)' })
  async putBugStatuses(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateBugStatusesDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateBugStatuses.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) {
      throw new BadRequestException(result.error as string);
    }
    return this.present(result.getValue());
  }

  @Put('task-statuses')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename / recolor / reorder / add task board columns (admin)' })
  async putTaskStatuses(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateTaskStatusesDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateTaskStatuses.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) {
      throw new BadRequestException(result.error as string);
    }
    return this.present(result.getValue());
  }

  @Put('storage')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update cloud-storage config for media uploads (admin)' })
  async putStorage(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateStorageDto,
  ): Promise<AppSettingsResponseDto> {
    const result = await this.updateStorage.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) {
      throw new BadRequestException(result.error as string);
    }
    return this.present(result.getValue());
  }
}
