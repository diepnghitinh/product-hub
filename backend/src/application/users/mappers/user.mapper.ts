import { UserEntity } from '../domain/entities/user.entity';
import { UserResponseDto } from '../dtos/user.response.dto';

export class UserMapper {
  static toResponseDto(user: UserEntity): UserResponseDto {
    return {
      id: user.id.toString(),
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toResponseDtoArray(users: UserEntity[]): UserResponseDto[] {
    return users.map((u) => this.toResponseDto(u));
  }
}
