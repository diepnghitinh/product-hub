import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** S3 tops out at 10,000 parts — an array longer than that can't be real. */
const MAX_PARTS = 10000;

export class BeginChunkedUploadDto {
  @ApiProperty({ example: 'Báo cáo quý 4.xlsx' })
  @IsString()
  @MaxLength(400)
  name: string;

  @ApiProperty({ example: 84_293_120, description: 'Total bytes, checked against the tenant cap' })
  @IsInt()
  @Min(1)
  size: number;

  @ApiProperty({
    required: false,
    example: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'What the browser thinks it is — the extension still wins',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contentType?: string;
}

/** One chunk the storage provider already accepted, echoed back to assemble. */
export class UploadedPartDto {
  @ApiProperty({ example: 3, description: '1-based' })
  @IsInt()
  @Min(1)
  partNumber: number;

  @ApiProperty({ example: '"9bb58f26192e4ba00f01e2e7b136bbd8"' })
  @IsString()
  @MaxLength(200)
  etag: string;
}

export class CompleteChunkedUploadDto {
  @ApiProperty({ type: [UploadedPartDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PARTS)
  @ValidateNested({ each: true })
  @Type(() => UploadedPartDto)
  parts: UploadedPartDto[];
}
