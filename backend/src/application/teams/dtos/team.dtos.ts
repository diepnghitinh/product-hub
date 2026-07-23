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
import { CustomFieldType } from '../domain/enums/custom-field.enums';
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

/** One item label shared by the team's tasks/bugs. */
export class TeamLabelDto {
  @ApiProperty({ example: 'needs-design', description: 'Stable slug; never changes once items use it' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'Needs design' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ example: '#a855f7' })
  @IsString()
  color: string;
}

export class UpdateTeamLabelsDto {
  @ApiProperty({ type: [TeamLabelDto], description: 'The full label list (empty clears them)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamLabelDto)
  labels: TeamLabelDto[];
}

/** One team-defined custom field (shared by the team's tasks/bugs). */
export class CustomFieldDto {
  @ApiProperty({ example: 'field-1', description: 'Stable id; never changes once items use it' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  id: string;

  @ApiProperty({ example: 'Story points' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ enum: CustomFieldType, description: 'text · number · select · date · checkbox' })
  @IsEnum(CustomFieldType)
  type: CustomFieldType;

  @ApiPropertyOptional({ type: [String], description: 'Choices for a select field (ignored otherwise)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'When true, an empty value is flagged on the item' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class UpdateTeamCustomFieldsDto {
  @ApiProperty({ type: [CustomFieldDto], description: 'The full custom-field list (empty clears them)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDto)
  customFields: CustomFieldDto[];
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

  @ApiProperty({ type: [TeamLabelDto], description: "This team's item labels (may be empty)" })
  labels: TeamLabelDto[];

  @ApiProperty({ type: [CustomFieldDto], description: "This team's custom fields (may be empty)" })
  customFields: CustomFieldDto[];

  @ApiProperty({ description: 'Whether the automatic sprint rhythm is on' })
  cyclesEnabled: boolean;

  @ApiProperty({ description: 'Weeks per cycle (1–4)' })
  cycleLengthWeeks: number;

  @ApiProperty({ description: 'Weeks between cycles with no current cycle (0–2)' })
  cycleCooldownWeeks: number;

  @ApiProperty({ description: 'Weekday a cycle starts on: 1 = Monday … 7 = Sunday' })
  cycleStartDay: number;

  @ApiProperty({ description: 'Unfinished issues move to the next cycle when one ends' })
  cycleAutoRollover: boolean;

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
