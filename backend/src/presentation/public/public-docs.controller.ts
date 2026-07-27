import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { EntityNotFoundException } from '@core/exceptions';
import { GetPublicDocUseCase } from '@application/docs/use-cases/doc.use-cases';
import { DocMapper } from '@application/docs/mappers';
import {
  DocPageResponseDto,
  DocResponseDto,
} from '@application/docs/dtos/doc.response.dto';

interface PublicDocView {
  doc: DocResponseDto;
  /** Every page *with* its body — a shared doc is read in one go, not page by page. */
  pages: DocPageResponseDto[];
}

/** Public read-only doc (no auth) resolved from a share token. */
@ApiTags('Public API')
@Public()
@Controller('public/docs')
export class PublicDocsController {
  constructor(private readonly getPublic: GetPublicDocUseCase) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read-only doc by share token' })
  async view(@Param('token') token: string): Promise<PublicDocView> {
    const result = await this.getPublic.execute({ token });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { doc, pages } = result.getValue();
    return {
      doc: DocMapper.toResponseDto(doc, pages),
      pages: pages.map((p) => DocMapper.toPageResponseDto(p)),
    };
  }
}
