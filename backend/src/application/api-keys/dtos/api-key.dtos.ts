import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI pipeline' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

/** Masked key shape for the list (never exposes the secret). */
export class ApiKeyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Masked display prefix' }) prefix: string;
  @ApiProperty({ nullable: true }) lastUsedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

/** Returned once, at creation, including the plaintext secret. */
export class CreatedApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({ description: 'The full key — shown only once' }) key: string;
}
