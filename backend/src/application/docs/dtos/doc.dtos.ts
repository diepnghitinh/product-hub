import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TEAM_COLORS } from '@application/teams/domain/enums/team.enums';
import {
  DocFontSize,
  DocFontStyle,
  DocLinkKind,
  DocPageWidth,
} from '../domain/enums/doc.enums';

export class CreateDocDto {
  @ApiProperty({ example: 'Discovery — Ads Connect' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ description: 'Symbol name (TEAM_ICONS)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional({ description: 'Accent for the symbol', enum: TEAM_COLORS })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(TEAM_COLORS)
  color?: string | null;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Free-text tags for the hub filter' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class UpdateDocDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional({ description: 'Accent for the symbol', enum: TEAM_COLORS })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(TEAM_COLORS)
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Replaces the whole list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class DuplicateDocDto {
  @ApiPropertyOptional({
    description: 'Name for the copy. Defaults to "<title> (copy)".',
    example: 'Discovery — Ads Connect (copy)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;
}

export class ShareDocDto {
  @ApiProperty({ description: 'Enable or disable the public read-only link' })
  @IsBoolean()
  enabled: boolean;
}

/** One record a page is attached to. Denormalized on purpose — see `DocLinkRef`. */
export class DocLinkInputDto {
  @ApiProperty({ enum: DocLinkKind })
  @IsEnum(DocLinkKind)
  kind: DocLinkKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  refId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ description: 'Owning roadmap — roadmap-item links only' })
  @IsOptional()
  @IsString()
  roadmapId?: string;

  @ApiPropertyOptional({ description: 'bug | task — issue links only' })
  @IsOptional()
  @IsString()
  issueKind?: 'bug' | 'task';
}

/** One file attached to a page — the result of an upload, echoed back to be saved. */
export class DocAttachmentInputDto {
  @ApiProperty({ description: 'Public URL returned by POST /uploads' })
  @IsString()
  @MaxLength(2000)
  // Only ever a stored file, and the chip is a link a reader clicks — so anything
  // that isn't plain http(s) (`javascript:`, `data:`) has no business here.
  @Matches(/^https?:\/\//i, { message: 'url must be an http(s) URL' })
  url: string;

  @ApiProperty({ example: 'requirements-v3.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(200)
  contentType: string;

  @ApiProperty({ description: 'Bytes' })
  @IsInt()
  @Min(0)
  size: number;
}

export class CreateDocPageDto {
  @ApiPropertyOptional({ description: 'Defaults to "Untitled"' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ description: 'Nest under this page ("" = top level)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Initial body as HTML' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateDocPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional({ description: 'Accent for the symbol', enum: TEAM_COLORS })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(TEAM_COLORS)
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ description: 'The page body as HTML' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [DocLinkInputDto], description: 'Replaces the whole list' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocLinkInputDto)
  links?: DocLinkInputDto[];

  @ApiPropertyOptional({ type: [DocAttachmentInputDto], description: 'Replaces the whole list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DocAttachmentInputDto)
  attachments?: DocAttachmentInputDto[];

  // ── Page Styles ───────────────────────────────────────────────────────────
  // Flat and all-optional: the panel patches one control at a time, so an
  // absent field means "leave it alone", not "reset it".

  @ApiPropertyOptional({ enum: DocFontStyle })
  @IsOptional()
  @IsEnum(DocFontStyle)
  fontStyle?: DocFontStyle;

  @ApiPropertyOptional({ enum: DocFontSize })
  @IsOptional()
  @IsEnum(DocFontSize)
  fontSize?: DocFontSize;

  @ApiPropertyOptional({ enum: DocPageWidth })
  @IsOptional()
  @IsEnum(DocPageWidth)
  pageWidth?: DocPageWidth;

  @ApiPropertyOptional({ description: 'Show the banner image' })
  @IsOptional()
  @IsBoolean()
  showCover?: boolean;

  @ApiPropertyOptional({ description: 'Show the icon + title heading' })
  @IsOptional()
  @IsBoolean()
  showTitle?: boolean;

  @ApiPropertyOptional({ description: 'Show the "updated by" byline' })
  @IsOptional()
  @IsBoolean()
  showUpdated?: boolean;

  @ApiPropertyOptional({ description: 'Show the linked-records row' })
  @IsOptional()
  @IsBoolean()
  showLinks?: boolean;

  @ApiPropertyOptional({ description: 'Show the attachments row' })
  @IsOptional()
  @IsBoolean()
  showAttachments?: boolean;
}

export class SaveDocPageVersionDto {
  @ApiPropertyOptional({ description: 'Name this save, e.g. "Before the pricing rewrite"' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

/** Where one page sits after a drag: its parent and its rank among siblings. */
export class DocPagePositionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty({ description: '"" = top level' })
  @IsString()
  parentId: string;

  @ApiProperty()
  @IsInt()
  order: number;
}

export class ReorderDocPagesDto {
  @ApiProperty({ type: [DocPagePositionDto], description: 'Every page whose slot changed' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocPagePositionDto)
  pages: DocPagePositionDto[];
}
