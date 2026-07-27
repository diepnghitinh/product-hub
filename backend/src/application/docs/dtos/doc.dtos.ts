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
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TEAM_COLORS } from '@application/teams/domain/enums/team.enums';
import { DocLinkKind } from '../domain/enums/doc.enums';

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
