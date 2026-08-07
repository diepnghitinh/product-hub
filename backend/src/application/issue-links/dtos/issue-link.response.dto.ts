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

  @ApiProperty({
    enum: IssueKind,
    description: "The linked issue's kind — may differ from the issue you asked about (a bug can block a task)",
  })
  targetKind: IssueKind;

  @ApiProperty({ description: 'The other issue in the relation' })
  targetId: string;

  @ApiProperty()
  targetShortId: string;

  @ApiProperty()
  targetTitle: string;

  @ApiProperty()
  targetStatus: string;

  @ApiProperty({
    description:
      "The linked issue's last reported pipeline state ('' when none ever has) — so a " +
      'relation row can show whether the thing blocking you is green.',
  })
  targetCiStatus: string;

  @ApiProperty({ description: "Branch that run was on; '' when unknown." })
  targetCiBranch: string;

  @ApiProperty({ description: 'When that state was reported; null when never.' })
  targetCiUpdatedAt: Date | null;
}
