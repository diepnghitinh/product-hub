import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import {
  UploadMediaUseCase,
  UploadedMediaResult,
} from '@application/storage/use-cases/upload-media.use-case';
import { TestStorageConnectionUseCase } from '@application/storage/use-cases/test-storage.use-case';
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
