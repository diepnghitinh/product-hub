import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CreateCommentDto } from './create-comment.dto';

/**
 * A doc-page comment. Everything a comment already carries, plus where on the
 * page it points.
 *
 * The anchor is a *text quote*, not an offset: the selected passage plus a little
 * context either side. Offsets would be wrong the moment somebody typed a word
 * above the highlight — the quote is re-found in the rendered page each time it's
 * drawn, so a highlight rides along with its sentence through edits, and simply
 * stops resolving (goes orphaned) once that sentence is deleted.
 *
 * All four are optional together: a comment written with nothing selected is a
 * page-level comment, which the sidebar lists without a highlight.
 */
export class CreateDocCommentDto extends CreateCommentDto {
  @ApiPropertyOptional({
    example: 'retry up to 3 times',
    description: 'The selected text. Empty for a page-level comment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  anchorExact?: string;

  @ApiPropertyOptional({ description: 'Text immediately before the selection' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  anchorPrefix?: string;

  @ApiPropertyOptional({ description: 'Text immediately after the selection' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  anchorSuffix?: string;

  @ApiPropertyOptional({
    description:
      'Plain-text offset of the selection when written — a tie-breaker when the quote appears more than once.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  anchorStart?: number;
}

export class ResolveDocCommentDto {
  @ApiProperty({ description: 'true resolves the thread, false reopens it' })
  @IsBoolean()
  resolved: boolean;
}

/** Open threads on one page — the count the doc's page rail badges. */
export class DocPageCommentCountDto {
  @ApiProperty()
  pageId: string;

  @ApiProperty({ description: 'Unresolved top-level threads on this page' })
  openCount: number;
}
