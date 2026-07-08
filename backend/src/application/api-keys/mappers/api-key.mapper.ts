import { ApiKeyEntity } from '../domain/api-key.entity';
import { ApiKeyResponseDto } from '../dtos/api-key.dtos';

export class ApiKeyMapper {
  static toResponseDto(key: ApiKeyEntity): ApiKeyResponseDto {
    return {
      id: key.id.toString(),
      name: key.name,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    };
  }

  static toResponseDtoArray(keys: ApiKeyEntity[]): ApiKeyResponseDto[] {
    return keys.map((k) => this.toResponseDto(k));
  }
}
