import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TestResult } from '../domain/enums/test-result.enum';

export class SetResultDto {
  @ApiProperty({ enum: TestResult })
  @IsEnum(TestResult)
  result: TestResult;
}
