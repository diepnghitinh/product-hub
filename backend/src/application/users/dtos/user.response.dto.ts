import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@core/interfaces';

/** Public user shape — never includes the password hash. Flat by convention. */
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiPropertyOptional({ nullable: true, description: 'Avatar image URL, or null for the initials fallback.' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'When this account was last online, or null if never seen.',
  })
  lastActiveAt?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
