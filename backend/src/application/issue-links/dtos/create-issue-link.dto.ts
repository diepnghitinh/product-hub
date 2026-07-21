import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { IssueKind, RelationType } from '../domain/relation-type.enum';

export class CreateIssueLinkDto {
  @ApiProperty({ enum: IssueKind })
  @IsEnum(IssueKind)
  issueType: IssueKind;

  @ApiProperty({ description: 'The issue the menu was opened on (source of the relation)' })
  @IsString()
  @MinLength(1)
  sourceId: string;

  @ApiProperty({ description: 'The issue being linked (same kind as the source)' })
  @IsString()
  @MinLength(1)
  targetId: string;

  @ApiProperty({ enum: RelationType })
  @IsEnum(RelationType)
  relationType: RelationType;
}
