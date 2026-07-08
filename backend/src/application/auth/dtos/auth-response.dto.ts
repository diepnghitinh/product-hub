import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '@application/users/dtos/user.response.dto';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer token' })
  token: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
