import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class MarkInboxReadDto {
  @ApiProperty({ description: 'The notification key to mark read (from the inbox item)' })
  @IsString()
  @MinLength(1)
  key: string;
}
