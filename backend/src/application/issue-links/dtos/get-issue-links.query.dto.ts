import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GetIssueLinksQueryDto {
  @ApiProperty({ description: 'Id of the task/bug whose relations to list' })
  @IsString()
  @MinLength(1)
  issueId: string;
}
