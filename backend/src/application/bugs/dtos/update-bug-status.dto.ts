import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateBugStatusDto {
  // A column key: a built-in `BugStatus` or a tenant's custom column slug — so
  // this is a slug string, not an enum. The board only offers configured keys.
  @ApiProperty({ example: 'in-progress' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'status must be a lowercase slug' })
  @MaxLength(40)
  status: string;
}
