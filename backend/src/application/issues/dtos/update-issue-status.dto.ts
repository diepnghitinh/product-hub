import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateIssueStatusDto {
  // A column key: a built-in status or a tenant's custom column slug — the board
  // only ever offers configured keys, so this is a slug string, not an enum.
  @ApiProperty({ example: 'in-progress' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'status must be a lowercase slug' })
  @MaxLength(40)
  status: string;

  // Where in the column it landed: the id of the card it was dropped *onto*, i.e.
  // the one it now sits above. Omitted (or naming a card that isn't in the column
  // any more) means the end of the column — which is also what every caller from
  // before manual ordering existed sends, so they keep their old behaviour.
  @ApiPropertyOptional({ description: 'Insert above this issue; omit to append' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  beforeId?: string;
}
