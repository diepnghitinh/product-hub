import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BugStatus } from '../domain/enums/bug.enums';

export class UpdateBugStatusDto {
  @ApiProperty({ enum: BugStatus })
  @IsEnum(BugStatus)
  status: BugStatus;
}
