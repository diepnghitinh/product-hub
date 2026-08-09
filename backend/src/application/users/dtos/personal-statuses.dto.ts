import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  IssueStatusCategory,
  STATUS_DESCRIPTION_MAX,
} from '@application/issues/domain/enums/status-category.enums';

/** Lowercase slug — mirrors the tenant status-key rule in app-settings. */
const STATUS_KEY = /^[a-z0-9][a-z0-9-]*$/;

/** One personal-board column. Same shape as a team `TaskStatusConfig`. */
export class PersonalStatusConfigDto {
  @ApiProperty({ example: 'in-progress' })
  @IsString()
  @Matches(STATUS_KEY, { message: 'key must be a lowercase slug' })
  @MaxLength(40)
  key: string;

  @ApiProperty({ example: 'In progress' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @ApiProperty({ example: '#2563eb' })
  @IsString()
  @MaxLength(32)
  color: string;

  @ApiPropertyOptional({
    enum: IssueStatusCategory,
    description: 'What the column means; `completed` is the one that ticks a task off',
  })
  @IsOptional()
  @IsEnum(IssueStatusCategory)
  category?: IssueStatusCategory;

  @ApiPropertyOptional({ example: 'Waiting on someone else' })
  @IsOptional()
  @IsString()
  @MaxLength(STATUS_DESCRIPTION_MAX)
  description?: string;
}

export class ReplacePersonalStatusesDto {
  @ApiProperty({ type: [PersonalStatusConfigDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PersonalStatusConfigDto)
  personalStatuses: PersonalStatusConfigDto[];
}
