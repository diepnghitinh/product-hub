import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  GenerateApiKeyUseCase,
  GetApiKeysUseCase,
  RevokeApiKeyUseCase,
} from '@application/api-keys/use-cases/api-key.use-cases';
import { CreateApiKeyDto, CreatedApiKeyResponseDto, ApiKeyResponseDto } from '@application/api-keys/dtos/api-key.dtos';
import { ApiKeyMapper } from '@application/api-keys/mappers';

@ApiTags('API keys')
@ApiBearerAuth('JWT-auth')
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly generate: GenerateApiKeyUseCase,
    private readonly getKeys: GetApiKeysUseCase,
    private readonly revoke: RevokeApiKeyUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List API keys (masked, admin)' })
  async list(@AuthUser() auth: JwtPayload): Promise<ApiKeyResponseDto[]> {
    const result = await this.getKeys.execute({ tenantId: auth.tenantId });
    return ApiKeyMapper.toResponseDtoArray(result.getValue());
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Generate an API key (secret shown once, admin)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyResponseDto> {
    const result = await this.generate.execute({
      tenantId: auth.tenantId,
      userId: auth.userId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { entity, plaintext } = result.getValue();
    return { ...ApiKeyMapper.toResponseDto(entity), key: plaintext };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Revoke an API key (admin)' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.revoke.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
