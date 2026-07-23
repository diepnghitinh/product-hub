import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateIssueStatusDto {
  // A column key: a built-in status or a tenant's custom column slug — the board
  // only ever offers configured keys, so this is a slug string, not an enum.
  @ApiProperty({ example: 'in-progress' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'status must be a lowercase slug' })
  @MaxLength(40)
  status: string;
}
