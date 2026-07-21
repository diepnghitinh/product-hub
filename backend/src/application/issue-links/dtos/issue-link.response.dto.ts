import { ApiProperty } from '@nestjs/swagger';
import { IssueKind, RelationType } from '../domain/relation-type.enum';

/**
 * One resolved relation, from the perspective of the issue you asked about.
 * `relationType` is already flipped to that perspective (an incoming "blocks"
 * reads as "blocked_by"). Flat by design — the linked issue's fields are inlined.
 */
export class IssueLinkResponseDto {
  @ApiProperty({ description: 'Link id — pass to DELETE to remove the relation' })
  id: string;

  @ApiProperty({ enum: RelationType })
  relationType: RelationType;

  @ApiProperty({ enum: IssueKind })
  issueType: IssueKind;

  @ApiProperty({ description: 'The other issue in the relation' })
  targetId: string;

  @ApiProperty()
  targetShortId: string;

  @ApiProperty()
  targetTitle: string;

  @ApiProperty()
  targetStatus: string;
}
