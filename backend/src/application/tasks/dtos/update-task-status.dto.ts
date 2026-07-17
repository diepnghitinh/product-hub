import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateTaskStatusDto {
  // A column key: a built-in `TaskStatus` or a tenant's custom column slug.
  @ApiProperty({ example: 'in-progress' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'status must be a lowercase slug' })
  @MaxLength(40)
  status: string;
}
