import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Authentication' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;
}
