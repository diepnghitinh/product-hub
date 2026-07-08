import { ApiProperty } from '@nestjs/swagger';

/** Flat comment shape. */
export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  bugId: string;

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
}
