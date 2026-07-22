import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    example: 'Reproduced on Safari 17. @jane can you take a look?',
    description: 'May be empty when the comment carries at least one attachment.',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description:
      'Id of the comment being replied to. Threads are one level deep — a reply to a reply attaches to that reply’s root.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ type: [String], description: 'User ids mentioned in the body' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
