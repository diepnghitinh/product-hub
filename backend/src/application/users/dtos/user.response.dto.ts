import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
