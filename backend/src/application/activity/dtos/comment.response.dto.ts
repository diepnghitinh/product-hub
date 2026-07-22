import { ApiProperty } from '@nestjs/swagger';

/** Flat comment shape. */
export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bugId: string;

  @ApiProperty({ description: 'Empty for a top-level comment; else the id of the comment it replies to' })
  parentId: string;

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
