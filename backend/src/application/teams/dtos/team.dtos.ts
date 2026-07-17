import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TeamIcon, TeamIssueType } from '../domain/enums/team.enums';

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

  @ApiPropertyOptional({ enum: TeamIcon, description: 'Nav symbol; defaults to the issue type icon' })
  @IsOptional()
  @IsEnum(TeamIcon)
  icon?: TeamIcon;
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

  @ApiPropertyOptional({ enum: TeamIcon, description: 'Nav symbol' })
  @IsOptional()
  @IsEnum(TeamIcon)
  icon?: TeamIcon;
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

  @ApiProperty({ enum: TeamIcon })
  icon: TeamIcon;

  @ApiProperty({ type: [TeamStatusDto], description: "This team's board columns, in order" })
  statuses: TeamStatusDto[];

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ description: 'True for the seeded QC/Engineering teams (cannot be archived)' })
  isDefault: boolean;

  @ApiProperty()
  order: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
