import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiKeyScope } from '../domain/api-key.enums';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI pipeline' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    enum: ApiKeyScope,
    required: false,
    description: 'What the key may do. Defaults to read-only.',
  })
  @IsOptional()
  @IsEnum(ApiKeyScope)
  scope?: ApiKeyScope;
}

/** Masked key shape for the list (never exposes the secret). */
export class ApiKeyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Masked display prefix' }) prefix: string;
  @ApiProperty({ enum: ApiKeyScope }) scope: ApiKeyScope;
  @ApiProperty({ nullable: true }) lastUsedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

/** Returned once, at creation, including the plaintext secret. */
export class CreatedApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({ description: 'The full key — shown only once' }) key: string;
}
