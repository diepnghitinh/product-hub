import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { IssueKind } from '../domain/relation-type.enum';

export class GetIssueLinksQueryDto {
  @ApiProperty({ enum: IssueKind })
  @IsEnum(IssueKind)
  issueType: IssueKind;

  @ApiProperty({ description: 'Id of the task/bug whose relations to list' })
  @IsString()
  @MinLength(1)
  issueId: string;
}
