import { ApiProperty } from '@nestjs/swagger';

/** Flat comment shape. */
export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'The issue (bug or task) this comment is on; empty for a roadmap-item comment' })
  issueId: string;

  @ApiProperty({ description: 'Empty for a top-level comment; else the id of the comment it replies to' })
  parentId: string;

  @ApiProperty({ description: 'The doc page this comment is on; empty for issue / roadmap comments' })
  docPageId: string;

  @ApiProperty({ description: 'The doc owning that page; empty for issue / roadmap comments' })
  docId: string;

  @ApiProperty({
    description:
      'The quoted passage this comment points at. Empty on a page-level comment. Re-found in the rendered page rather than stored as an offset, so it survives edits around it.',
  })
  anchorExact: string;

  @ApiProperty({ description: 'Text immediately before the quote (disambiguates repeats)' })
  anchorPrefix: string;

  @ApiProperty({ description: 'Text immediately after the quote' })
  anchorSuffix: string;

  @ApiProperty({ description: 'Plain-text offset when written; -1 when unknown. A tie-breaker only.' })
  anchorStart: number;

  @ApiProperty({ description: 'A resolved thread drops its highlight and files under “Resolved”' })
  resolved: boolean;

  @ApiProperty()
  resolvedById: string;

  @ApiProperty()
  resolvedByName: string;

  @ApiProperty({ nullable: true })
  resolvedAt: Date | null;

  @ApiProperty()
  authorId: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: [String] })
  mentions: string[];

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ description: 'Equals createdAt unless the comment was edited' })
  updatedAt: Date;
}
