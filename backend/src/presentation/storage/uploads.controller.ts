import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import {
  UploadMediaUseCase,
  UploadedMediaResult,
} from '@application/storage/use-cases/upload-media.use-case';
import { TestStorageConnectionUseCase } from '@application/storage/use-cases/test-storage.use-case';
import { FetchUploadUseCase } from '@application/storage/use-cases/fetch-upload.use-case';
import { UpdateStorageDto } from '@application/app-settings/dtos/app-settings.dtos';

// A generous hard ceiling so a normal short video always reaches the use-case,
// where the precise per-type cap (e.g. 30MB video) from the tenant config is
// enforced with a clear message. Anything larger is almost certainly abuse.
const HARD_LIMIT_BYTES = 250 * 1024 * 1024;

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadMedia: UploadMediaUseCase,
    private readonly testStorage: TestStorageConnectionUseCase,
    private readonly fetchUpload: FetchUploadUseCase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES } }))
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
      originalName: file.originalname,
      size: file.size,
    });
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
    // to the same caller that sent it, and sanitized below like any other.
    // The filename is only ever used by a download, and a quote in it would end
    // the header value early — strip anything that could break out of it.
    const safeName = (name?.trim().slice(0, 260) || file.filename).replace(/["\\\r\n]/g, '');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${file.inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
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
