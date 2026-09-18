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
import {
  CreateUploadUrlUseCase,
  PresignedUploadResult,
} from '@application/storage/use-cases/create-upload-url.use-case';
import {
  FinishUploadUseCase,
  FinishedUploadResult,
} from '@application/storage/use-cases/finish-upload.use-case';
import { UPLOAD_HARD_LIMIT_BYTES } from '@application/storage/use-cases/upload-policy';
import { TestStorageConnectionUseCase } from '@application/storage/use-cases/test-storage.use-case';
import {
  CompleteUploadDto,
  CreateUploadUrlDto,
  MultipartRefDto,
} from '@application/storage/dtos/uploads.dtos';
import { UpdateStorageDto } from '@application/app-settings/dtos/app-settings.dtos';

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadMedia: UploadMediaUseCase,
    private readonly createUploadUrl: CreateUploadUrlUseCase,
    private readonly finishUpload: FinishUploadUseCase,
    private readonly testStorage: TestStorageConnectionUseCase,
  ) {}

  /**
   * One door for every direct upload. The answer says which of the three routes
   * this file takes — parts, a single PUT, or back through the API — so the client
   * asks once and reads the reply rather than guessing from the size.
   */
  @Post('presign')
  @ApiOperation({
    summary: 'Get a short-lived URL to upload a file straight to the tenant storage',
  })
  async presign(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateUploadUrlDto,
  ): Promise<PresignedUploadResult> {
    return this.createUploadUrl.execute(auth.tenantId, {
      originalName: dto.name,
      contentType: dto.contentType ?? '',
      size: dto.size,
    });
  }

  @Post('multipart/complete')
  @ApiOperation({ summary: 'Join the uploaded parts into the finished file' })
  async completeMultipart(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CompleteUploadDto,
  ): Promise<FinishedUploadResult> {
    return this.finishUpload.complete(
      auth.tenantId,
      { key: dto.key, uploadId: dto.uploadId },
      dto.etags,
    );
  }

  /**
   * Called when the browser gives up, so the parts already stored stop being
   * billed. Not the only defence — the bucket's lifecycle rule sweeps up after a
   * tab that was closed instead — but the immediate one.
   */
  @Post('multipart/abort')
  @ApiOperation({ summary: 'Bin an upload that will not finish' })
  async abortMultipart(
    @AuthUser() auth: JwtPayload,
    @Body() dto: MultipartRefDto,
  ): Promise<{ ok: true }> {
    await this.finishUpload.abort(auth.tenantId, { key: dto.key, uploadId: dto.uploadId });
    return { ok: true };
  }

  /**
   * The bytes-through-the-API route. Kept as the fallback for callers that can't
   * spend a signed URL — see `UploadMediaUseCase` — so it still enforces the same
   * hard ceiling the presign DTO does.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image or short video through the API (fallback)' })
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
