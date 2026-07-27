import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Set or clear the signed-in user's avatar. The URL is one returned by the
 * `/uploads` endpoint (cloud storage). Send `null` to remove the avatar and
 * fall back to initials. `null` is skipped by validation (via `ValidateIf`);
 * omitting the field entirely is rejected, so the intent is always explicit.
 */
export class UpdateAvatarDto {
  @ApiProperty({
    nullable: true,
    example: 'https://cdn.example.com/avatars/abc.webp',
    description: 'Avatar image URL from /uploads, or null to remove it.',
  })
  @ValidateIf((o: UpdateAvatarDto) => o.avatarUrl !== null)
  @IsString()
  @MaxLength(2048)
  avatarUrl!: string | null;
}
