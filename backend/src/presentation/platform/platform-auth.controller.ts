import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import {
  EntityNotFoundException,
  UnauthorizedDomainException,
  ValidationException,
} from '@core/exceptions';
import { PlatformJwtPayload } from '@application/platform/domain/platform-jwt-payload';
import {
  ChangePlatformPasswordDto,
  PlatformAdminResponseDto,
  PlatformAuthResponseDto,
  PlatformLoginDto,
} from '@application/platform/dtos/platform-auth.dtos';
import { PlatformAdminMapper } from '@application/platform/mappers/platform.mapper';
import { CurrentPlatformAdmin } from '@application/platform/services/platform-admin.decorator';
import { PlatformAuth } from '@application/platform/services/platform-auth.guard';
import {
  ChangePlatformPasswordUseCase,
  GetPlatformAdminUseCase,
  LoginPlatformAdminUseCase,
} from '@application/platform/use-cases/platform-auth.use-cases';

@ApiTags('Platform · Auth')
@Controller('auth')
export class PlatformAuthController {
  constructor(
    private readonly loginUseCase: LoginPlatformAdminUseCase,
    private readonly getAdminUseCase: GetPlatformAdminUseCase,
    private readonly changePasswordUseCase: ChangePlatformPasswordUseCase,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in to the platform console' })
  async login(@Body() dto: PlatformLoginDto): Promise<PlatformAuthResponseDto> {
    const result = await this.loginUseCase.execute({ dto });
    if (result.isFailure) throw new UnauthorizedDomainException(result.error as string);
    const { token, admin } = result.getValue();
    return { token, admin: PlatformAdminMapper.toResponseDto(admin) };
  }

  @PlatformAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the signed-in platform operator' })
  async me(
    @CurrentPlatformAdmin() auth: PlatformJwtPayload,
  ): Promise<PlatformAdminResponseDto> {
    const result = await this.getAdminUseCase.execute({ adminId: auth.adminId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return PlatformAdminMapper.toResponseDto(result.getValue());
  }

  @PlatformAuth()
  @Post('change-password')
  @ApiOperation({ summary: "Change the operator's own password" })
  async changePassword(
    @CurrentPlatformAdmin() auth: PlatformJwtPayload,
    @Body() dto: ChangePlatformPasswordDto,
  ): Promise<{ success: boolean }> {
    const result = await this.changePasswordUseCase.execute({
      adminId: auth.adminId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
    if (result.isFailure) throw new ValidationException(result.error as string);
    return { success: true };
  }
}
