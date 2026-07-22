import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import { IServiceListResponse, ServiceResponse } from '@core/helpers';
import {
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
  ResetUserPasswordUseCase,
  GetPersonalStatusesUseCase,
  ReplacePersonalStatusesUseCase,
} from '@application/users/use-cases';
import { CreateUserDto } from '@application/users/dtos/create-user.dto';
import { UpdateUserDto } from '@application/users/dtos/update-user.dto';
import { QueryUserDto } from '@application/users/dtos/query-user.dto';
import { ChangePasswordDto } from '@application/users/dtos/change-password.dto';
import { ResetPasswordDto } from '@application/users/dtos/reset-password.dto';
import { ReplacePersonalStatusesDto } from '@application/users/dtos/personal-statuses.dto';
import { UserResponseDto } from '@application/users/dtos/user.response.dto';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';
import { UserMapper } from '@application/users/mappers';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller()
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUsers: GetUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly resetUserPassword: ResetUserPasswordUseCase,
    private readonly getPersonalStatuses: GetPersonalStatusesUseCase,
    private readonly replacePersonalStatuses: ReplacePersonalStatusesUseCase,
  ) {}

  // Self-service — declared before ':id' routes. Any authenticated user.
  @Put('me/password')
  @ApiOperation({ summary: 'Change your own password' })
  async changeOwnPassword(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    const result = await this.changePassword.execute({ userId: auth.userId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }

  // Personal-board columns are private to each user. Both routes read the owner
  // from the token, so no one can see or edit another person's board.
  @Get('me/personal-statuses')
  @ApiOperation({ summary: 'Get your private personal-board columns' })
  async getMyPersonalStatuses(
    @AuthUser() auth: JwtPayload,
  ): Promise<TaskStatusConfig[]> {
    const result = await this.getPersonalStatuses.execute({ userId: auth.userId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue();
  }

  @Put('me/personal-statuses')
  @ApiOperation({ summary: 'Add / rename / recolour / reorder / remove your personal-board columns' })
  async putMyPersonalStatuses(
    @AuthUser() auth: JwtPayload,
    @Body() dto: ReplacePersonalStatusesDto,
  ): Promise<TaskStatusConfig[]> {
    const result = await this.replacePersonalStatuses.execute({ userId: auth.userId, dto });
    if (result.isFailure) throw new BadRequestException(result.error as string);
    return result.getValue();
  }

  @Get()
  // Read-only people list — any member needs it to @-mention teammates and see
  // assignee names. Writes (create/update/delete) stay admin-only below.
  @Roles(Role.ADMIN, Role.PRODUCT, Role.TESTER, Role.DEVELOPER)
  @ApiOperation({ summary: 'List users in your tenant' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: QueryUserDto,
  ): Promise<IServiceListResponse<UserResponseDto>> {
    const result = await this.getUsers.execute({ tenantId: auth.tenantId, query });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(
      UserMapper.toResponseDtoArray(data),
      total,
      page,
      limit,
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a user in your tenant' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const result = await this.createUser.execute({ tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return UserMapper.toResponseDto(result.getValue());
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Get a user by id' })
  async findOne(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<UserResponseDto> {
    const result = await this.getUser.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return UserMapper.toResponseDto(result.getValue());
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a user (name / role)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const result = await this.updateUser.execute({
      id,
      tenantId: auth.tenantId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return UserMapper.toResponseDto(result.getValue());
  }

  // Admin-only reset. A distinct path from `@Patch(':id')` so it never collides
  // with a name/role update. No email infra exists, so the new password is set
  // directly and the admin relays it to the user out-of-band.
  @Patch(':id/password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Reset another user's password" })
  async resetPassword(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<{ ok: true }> {
    const result = await this.resetUserPassword.execute({
      id,
      tenantId: auth.tenantId,
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a user' })
  async remove(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const result = await this.deleteUser.execute({
      id,
      tenantId: auth.tenantId,
      actingUserId: auth.userId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }
}
