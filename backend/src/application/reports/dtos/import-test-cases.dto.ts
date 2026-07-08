import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

/** A loosely-typed incoming case row (normalized server-side before import). */
export interface RawTestCaseInput {
  area?: string;
  type?: string;
  result?: string;
  owner?: string;
  precondition?: string;
  testSteps?: string[] | string;
  expectedResult?: string;
  actualResult?: string;
  note?: string;
}

export class ImportTestCasesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Rows parsed from xlsx/JSON (normalized client-side)',
  })
  @IsArray()
  cases: RawTestCaseInput[];
}
