import { ApiProperty } from '@nestjs/swagger';

/** One emoji's tally on a target (flat) — what the reaction bar renders. */
export class ReactionGroupResponseDto {
  @ApiProperty()
  emoji: string;

  @ApiProperty()
  count: number;

  @ApiProperty({ description: 'Whether the current user reacted with this emoji' })
  reactedByMe: boolean;

  @ApiProperty({ type: [String], description: 'Names of who reacted (for the hover tooltip)' })
  userNames: string[];
}
