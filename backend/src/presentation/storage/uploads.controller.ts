import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import {
  UploadMediaUseCase,
  UploadedMediaResult,
} from '@application/storage/use-cases/upload-media.use-case';
import { TestStorageConnectionUseCase } from '@application/storage/use-cases/test-storage.use-case';
import { FetchUploadUseCase } from '@application/storage/use-cases/fetch-upload.use-case';
import {
  BeginChunkedUploadResult,
  ChunkedUploadUseCase,
  UploadChunkResult,
} from '@application/storage/use-cases/chunked-upload.use-case';
import { CHUNK_SIZE } from '@application/storage/domain/upload-ticket';
import {
  contentDispositionHeader,
  decodeMultipartFilename,
} from '@application/storage/domain/filename';
import {
  BeginChunkedUploadDto,
  CompleteChunkedUploadDto,
} from '@application/storage/dtos/chunked-upload.dtos';
import { UpdateStorageDto } from '@application/app-settings/dtos/app-settings.dtos';

// A generous hard ceiling so a normal short video always reaches the use-case,
// where the precise per-type cap (e.g. 30MB video) from the tenant config is
// enforced with a clear message. Anything larger is almost certainly abuse.
const HARD_LIMIT_BYTES = 250 * 1024 * 1024;

/** The multipart envelope adds a little to a chunk; leave room for it. */
const CHUNK_LIMIT_BYTES = CHUNK_SIZE + 64 * 1024;

/** Where the signed ticket rides between `begin` and `complete`. */
const TICKET_HEADER = 'x-upload-ticket';

/**
 * The chunk number travels in a header, not the query string, because the
 * browser's CORS preflight cache is keyed by the full URL — `?part=1` and
 * `?part=2` would each pay for their own OPTIONS round trip. One constant URL,
 * one preflight for the whole file.
 */
const PART_HEADER = 'x-upload-part';

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadMedia: UploadMediaUseCase,
    private readonly testStorage: TestStorageConnectionUseCase,
    private readonly fetchUpload: FetchUploadUseCase,
    private readonly chunked: ChunkedUploadUseCase,
  ) {}

  @Post()
  // `defParamCharset` is the whole reason a Vietnamese filename survives: busboy
  // defaults part headers to latin1, which turns `Báo cáo.xlsx` into
  // `BÃ¡o cÃ¡o.xlsx` before any of our code sees it. See {@link decodeMultipartFilename}.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES }, defParamCharset: 'utf8' }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image or short video to the tenant storage' })
  async upload(
    @AuthUser() auth: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedMediaResult> {
    if (!file) throw new BadRequestException('No file provided (form field "file").');
    return this.uploadMedia.execute(auth.tenantId, {
      buffer: file.buffer,
      contentType: file.mimetype,
      // Belt and braces: a no-op once the charset above is honoured, and the
      // repair if anything upstream (a proxy, an older client) sends latin1.
      originalName: decodeMultipartFilename(file.originalname),
      size: file.size,
    });
  }

  /**
   * Start a chunked upload — the path large files take. The client splits the
   * file, sends the chunks to `chunked/part`, then calls `chunked/complete`,
   * which returns the same shape as `POST /uploads`.
   *
   * The type and size are checked *here*, before any bytes move, so an
   * over-cap file is refused in one small request rather than after 200MB.
   */
  @Post('chunked/begin')
  @ApiOperation({ summary: 'Begin a chunked upload and get its signed ticket' })
  async beginChunked(
    @AuthUser() auth: JwtPayload,
    @Body() dto: BeginChunkedUploadDto,
  ): Promise<BeginChunkedUploadResult> {
    return this.chunked.begin(auth.tenantId, {
      name: decodeMultipartFilename(dto.name),
      size: dto.size,
      contentType: dto.contentType || 'application/octet-stream',
    });
  }

  /**
   * Send one chunk. It's forwarded straight to the storage provider, so the API
   * holds one chunk at a time no matter how big the file is.
   */
  @Post('chunked/part')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CHUNK_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: TICKET_HEADER, description: 'The ticket from chunked/begin' })
  @ApiHeader({ name: PART_HEADER, description: '1-based chunk number' })
  @ApiOperation({ summary: 'Upload one chunk of a file' })
  async uploadChunk(
    @AuthUser() auth: JwtPayload,
    @Headers(TICKET_HEADER) ticket: string,
    @Headers(PART_HEADER) part: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadChunkResult> {
    if (!file) throw new BadRequestException('No chunk provided (form field "file").');
    return this.chunked.part(auth.tenantId, ticket, Number(part), file.buffer);
  }

  /** Assemble the chunks. The result is indistinguishable from a normal upload. */
  @Post('chunked/complete')
  @ApiHeader({ name: TICKET_HEADER, description: 'The ticket from chunked/begin' })
  @ApiOperation({ summary: 'Finish a chunked upload' })
  async completeChunked(
    @AuthUser() auth: JwtPayload,
    @Headers(TICKET_HEADER) ticket: string,
    @Body() dto: CompleteChunkedUploadDto,
  ): Promise<UploadedMediaResult> {
    return this.chunked.complete(auth.tenantId, ticket, dto.parts);
  }

  /** Cancel an upload in progress and stop paying to store its orphaned parts. */
  @Post('chunked/abort')
  @ApiHeader({ name: TICKET_HEADER, description: 'The ticket from chunked/begin' })
  @ApiOperation({ summary: 'Abandon a chunked upload' })
  async abortChunked(
    @AuthUser() auth: JwtPayload,
    @Headers(TICKET_HEADER) ticket: string,
  ): Promise<{ ok: true }> {
    await this.chunked.abort(auth.tenantId, ticket);
    return { ok: true };
  }

  /**
   * Read a stored file back through the API so the in-app viewer can parse its
   * bytes — see {@link FetchUploadUseCase} for why a direct link won't do.
   *
   * `@Res()` on purpose: this returns the file itself, not the usual
   * `{ data: … }` envelope the response interceptor would wrap it in.
   */
  @Get('content')
  @ApiQuery({ name: 'url', description: 'A file URL in this workspace’s own storage' })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'What to call the file on download — the name the record shows',
  })
  @ApiOperation({ summary: 'Stream a stored file back (same-origin, for the file viewer)' })
  async content(
    @AuthUser() auth: JwtPayload,
    @Query('url') url: string,
    @Res() res: Response,
    @Query('name') name?: string,
  ): Promise<void> {
    if (!url) throw new BadRequestException('No file URL provided (query param "url").');
    const file = await this.fetchUpload.execute(auth.tenantId, url);
    // Prefer the name the record carries: storage keys are uuid-prefixed to stay
    // unique, so the key alone would save as `4f2c…-spec.docx`. It's echoed back
    // to the same caller that sent it, and sanitized in the helper like any
    // other client input that lands in a header.
    const wanted = decodeMultipartFilename(name?.trim() || file.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      contentDispositionHeader(file.inline ? 'inline' : 'attachment', wanted),
    );
    // Never let a browser sniff its way past the type we just decided on.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(file.buffer.byteLength));
    // Stored objects are immutable (every upload gets a fresh uuid key), so a
    // short private cache spares the round trip when a viewer is reopened.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(file.buffer);
  }

  @Post('test-connection')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Check whether the storage credentials work (admin)' })
  async testConnection(
    @AuthUser() auth: JwtPayload,
    @Body() dto: UpdateStorageDto,
  ): Promise<{ ok: true }> {
    await this.testStorage.execute(auth.tenantId, dto);
    return { ok: true };
  }
}
