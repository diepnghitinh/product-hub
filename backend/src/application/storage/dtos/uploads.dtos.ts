import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MULTIPART_MAX_PARTS, UPLOAD_HARD_LIMIT_BYTES } from '../use-cases/upload-policy';

/**
 * The shape `buildKey` produces: `uploads/yyyy-mm-dd/<uuid>-<safe name>`. Pinning
 * it here means a key that came back from the client can only ever name an object
 * in the uploads folder of that tenant's own bucket.
 */
const OBJECT_KEY = /^uploads\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,160}$/;

/**
 * What the browser says it is about to upload. No bytes — that is the point: the
 * API answers with a signed URL and never sees the file.
 */
export class CreateUploadUrlDto {
  @ApiProperty({ example: 'bug-report.png', description: "The file's name, extension included." })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'image/png',
    required: false,
    description: "The browser's content type. Blank is fine — the extension decides then.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contentType?: string;

  @ApiProperty({ example: 184320, description: 'Size in bytes. Signed into the URL on S3.' })
  @IsInt()
  @Min(1)
  @Max(UPLOAD_HARD_LIMIT_BYTES)
  size: number;
}

/** Names an upload already in progress — both halves are needed to act on it. */
export class MultipartRefDto {
  @ApiProperty({
    example: 'uploads/2026-09-18/9f1c-clip.mp4',
    description: 'The object key handed back when the upload was opened.',
  })
  @IsString()
  @Matches(OBJECT_KEY, { message: 'key is not an upload key.' })
  key: string;

  @ApiProperty({ description: "The provider's handle for the upload in progress." })
  @IsString()
  @MaxLength(500)
  uploadId: string;
}

/** Everything needed to join the parts into one object. */
export class CompleteUploadDto extends MultipartRefDto {
  @ApiProperty({
    type: [String],
    example: ['"a1b2…"', '"c3d4…"'],
    description: 'What each part PUT answered with, in part order — index 0 is part 1.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTIPART_MAX_PARTS)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  etags: string[];
}
