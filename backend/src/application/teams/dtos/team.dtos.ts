import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TEAM_COLORS, TeamIssueType } from '../domain/enums/team.enums';
import { TEAM_ICONS } from '../domain/enums/team-icons';

/** One board column. */
export class TeamStatusDto {
  @ApiProperty({ example: 'code-review', description: 'Stable slug; never changes once issues use it' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'Code review' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @ApiProperty({ example: '#a855f7' })
  @IsString()
  color: string;
}

export class UpdateTeamStatusesDto {
  @ApiProperty({ type: [TeamStatusDto], description: 'The full column list, in board order' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeamStatusDto)
  statuses: TeamStatusDto[];
}

export class CreateTeamDto {
  @ApiProperty({ example: 'Design' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: TeamIssueType, description: 'Which issue list the team owns' })
  @IsEnum(TeamIssueType)
  issueType: TeamIssueType;

  @ApiPropertyOptional({ description: 'Nav symbol; defaults to the issue type icon', example: 'rocket' })
  @IsOptional()
  @IsIn(TEAM_ICONS)
  icon?: string;

  @ApiPropertyOptional({ description: 'Accent for the symbol', enum: TEAM_COLORS })
  @IsOptional()
  @IsIn(TEAM_COLORS)
  color?: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Design' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ description: 'Archive/unarchive (default teams cannot be archived)' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ description: 'Nav symbol', example: 'rocket' })
  @IsOptional()
  @IsIn(TEAM_ICONS)
  icon?: string;

  @ApiPropertyOptional({ description: 'Accent for the symbol; null clears it', enum: TEAM_COLORS })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(TEAM_COLORS)
  color?: string | null;
}

export class ShareTeamDto {
  @ApiProperty({ description: 'Enable or disable the public read-only link' })
  @IsBoolean()
  enabled: boolean;
}

/** Flat team shape. */
export class TeamResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ example: 'qc' })
  key: string;

  @ApiProperty({ example: 'QC' })
  name: string;

  @ApiProperty({ enum: TeamIssueType })
  issueType: TeamIssueType;

  @ApiProperty({ example: 'rocket' })
  icon: string;

  @ApiProperty({ nullable: true, description: 'Accent for the symbol; null = inherits' })
  color: string | null;

  @ApiProperty({ type: [TeamStatusDto], description: "This team's board columns, in order" })
  statuses: TeamStatusDto[];

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ description: 'True for the seeded QC/Engineering teams (cannot be archived)' })
  isDefault: boolean;

  @ApiProperty()
  order: number;

  @ApiProperty()
  publicEnabled: boolean;

  @ApiProperty({ nullable: true })
  publicToken: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
