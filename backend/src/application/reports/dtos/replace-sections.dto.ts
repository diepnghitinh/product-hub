import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { ReportSection } from '../domain/types/section.types';

/** Replaces the whole document body. Sections are a Mixed/heterogeneous list, so
 * the shape is trusted (validated structurally by the domain/renderers). */
export class ReplaceSectionsDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  sections: ReportSection[];
}
