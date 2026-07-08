import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Public } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import {
  ConflictException,
  EntityNotFoundException,
  UnauthorizedDomainException,
} from '@core/exceptions';
import { RegisterUseCase } from '@application/auth/use-cases/register.use-case';
import { LoginUseCase } from '@application/auth/use-cases/login.use-case';
import { GetMeUseCase } from '@application/auth/use-cases/get-me.use-case';
import { RegisterDto } from '@application/auth/dtos/register.dto';
import { LoginDto } from '@application/auth/dtos/login.dto';
import { AuthResponseDto } from '@application/auth/dtos/auth-response.dto';
import { UserResponseDto } from '@application/users/dtos/user.response.dto';
import { UserMapper } from '@application/users/mappers';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new workspace + first admin' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    const result = await this.registerUseCase.execute({ dto });
    if (result.isFailure) throw new ConflictException(result.error as string);
    const { token, user } = result.getValue();
    return { token, user: UserMapper.toResponseDto(user) };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with email + password' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    const result = await this.loginUseCase.execute({ dto });
    if (result.isFailure) {
      throw new UnauthorizedDomainException(result.error as string);
    }
    const { token, user } = result.getValue();
    return { token, user: UserMapper.toResponseDto(user) };
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async me(@AuthUser() auth: JwtPayload): Promise<UserResponseDto> {
    const result = await this.getMeUseCase.execute({ userId: auth.userId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return UserMapper.toResponseDto(result.getValue());
  }
}
