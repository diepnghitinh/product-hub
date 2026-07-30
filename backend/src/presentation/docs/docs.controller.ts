import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AuthUser, Roles } from '@core/decorators';
import { JwtPayload, Role } from '@core/interfaces';
import { EntityNotFoundException } from '@core/exceptions';
import {
  CreateDocUseCase,
  DuplicateDocUseCase,
  GetDocsUseCase,
  GetDocUseCase,
  UpdateDocUseCase,
  DeleteDocUseCase,
  SetDocSharingUseCase,
} from '@application/docs/use-cases/doc.use-cases';
import {
  CreateDocPageUseCase,
  GetDocPageUseCase,
  UpdateDocPageUseCase,
  DeleteDocPageUseCase,
  ReorderDocPagesUseCase,
  GetLinkedDocPagesUseCase,
} from '@application/docs/use-cases/doc-page.use-cases';
import {
  SaveDocPageVersionUseCase,
  GetDocPageVersionsUseCase,
  GetDocPageVersionUseCase,
  RestoreDocPageVersionUseCase,
} from '@application/docs/use-cases/doc-page-version.use-cases';
import { ExportDocPagePdfUseCase } from '@application/docs/use-cases/doc-page-pdf.use-case';
import {
  CreateDocDto,
  CreateDocPageDto,
  DuplicateDocDto,
  ReorderDocPagesDto,
  SaveDocPageVersionDto,
  ShareDocDto,
  UpdateDocDto,
  UpdateDocPageDto,
} from '@application/docs/dtos/doc.dtos';
import {
  DocPageResponseDto,
  DocPageSummaryDto,
  DocPageVersionResponseDto,
  DocPageVersionSummaryDto,
  DocResponseDto,
  LinkedDocPageDto,
} from '@application/docs/dtos/doc.response.dto';
import { DocMapper } from '@application/docs/mappers';

/**
 * Docs — a workspace's written product knowledge. A doc is a container; its pages
 * nest into a tree and hold the writing. Writes follow the roadmap convention
 * (admin / tester / product); everyone signed in can read.
 */
@ApiTags('Docs')
@ApiBearerAuth('JWT-auth')
@Controller()
export class DocsController {
  constructor(
    private readonly createDoc: CreateDocUseCase,
    private readonly duplicateDoc: DuplicateDocUseCase,
    private readonly getDocs: GetDocsUseCase,
    private readonly getDoc: GetDocUseCase,
    private readonly updateDoc: UpdateDocUseCase,
    private readonly deleteDoc: DeleteDocUseCase,
    private readonly setSharing: SetDocSharingUseCase,
    private readonly createPage: CreateDocPageUseCase,
    private readonly getPage: GetDocPageUseCase,
    private readonly updatePage: UpdateDocPageUseCase,
    private readonly deletePage: DeleteDocPageUseCase,
    private readonly reorderPages: ReorderDocPagesUseCase,
    private readonly getLinked: GetLinkedDocPagesUseCase,
    private readonly saveVersionUseCase: SaveDocPageVersionUseCase,
    private readonly getVersions: GetDocPageVersionsUseCase,
    private readonly getVersion: GetDocPageVersionUseCase,
    private readonly restoreVersionUseCase: RestoreDocPageVersionUseCase,
    private readonly exportPagePdf: ExportDocPagePdfUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List docs' })
  async list(@AuthUser() auth: JwtPayload): Promise<DocResponseDto[]> {
    const result = await this.getDocs.execute({ tenantId: auth.tenantId });
    return result.getValue().map(({ doc, pageCount }) => DocMapper.toListDto(doc, pageCount));
  }

  /**
   * Doc pages attached to one record (an issue or a roadmap item). Declared
   * before `:id` so "links" isn't swallowed as a doc id.
   */
  @Get('links')
  @ApiOperation({ summary: 'Doc pages linked to an issue or roadmap item' })
  async linked(
    @AuthUser() auth: JwtPayload,
    @Query('refId') refId: string,
  ): Promise<LinkedDocPageDto[]> {
    if (!refId) return [];
    const result = await this.getLinked.execute({ tenantId: auth.tenantId, refId });
    return result
      .getValue()
      .map(({ page, docTitle, docRef }) => DocMapper.toLinkedPageDto(page, docTitle, docRef));
  }

  @Post()
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Create a doc (starts with one page)' })
  async create(
    @AuthUser() auth: JwtPayload,
    @Body() dto: CreateDocDto,
  ): Promise<DocResponseDto> {
    const result = await this.createDoc.execute({
      tenantId: auth.tenantId,
      author: { userId: auth.userId, name: auth.name },
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { doc, pages } = result.getValue();
    return DocMapper.toResponseDto(doc, pages);
  }

  /**
   * Copy a doc and its whole page tree. Same gate as creating one — a duplicate
   * is a new doc, and anyone who may write one may copy one.
   */
  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Duplicate a doc with every page in it' })
  async duplicate(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DuplicateDocDto,
  ): Promise<DocResponseDto> {
    const result = await this.duplicateDoc.execute({
      id,
      tenantId: auth.tenantId,
      author: { userId: auth.userId, name: auth.name },
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { doc, pages } = result.getValue();
    return DocMapper.toResponseDto(doc, pages);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a doc with its page tree (no page bodies)' })
  async findOne(@AuthUser() auth: JwtPayload, @Param('id') id: string): Promise<DocResponseDto> {
    const result = await this.getDoc.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { doc, pages } = result.getValue();
    return DocMapper.toResponseDto(doc, pages);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Update doc meta (title, symbol, cover)' })
  async update(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDocDto,
  ): Promise<DocResponseDto> {
    const result = await this.updateDoc.execute({ id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toResponseDto(result.getValue());
  }

  @Post(':id/share')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Toggle a doc public read-only link (admin/product)' })
  async share(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ShareDocDto,
  ): Promise<DocResponseDto> {
    const result = await this.setSharing.execute({
      id,
      tenantId: auth.tenantId,
      enabled: dto.enabled,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toResponseDto(result.getValue());
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PRODUCT)
  @ApiOperation({ summary: 'Delete a doc and all its pages (admin/product)' })
  async remove(@AuthUser() auth: JwtPayload, @Param('id') id: string): Promise<{ ok: true }> {
    const result = await this.deleteDoc.execute({ id, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true };
  }

  @Post(':id/pages')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Add a page to a doc' })
  async addPage(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateDocPageDto,
  ): Promise<DocPageResponseDto> {
    const result = await this.createPage.execute({
      docId: id,
      tenantId: auth.tenantId,
      author: { userId: auth.userId, name: auth.name },
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toPageResponseDto(result.getValue());
  }

  @Put(':id/pages')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Reorder / re-nest pages after a drag' })
  async movePages(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReorderDocPagesDto,
  ): Promise<DocPageSummaryDto[]> {
    const result = await this.reorderPages.execute({ docId: id, tenantId: auth.tenantId, dto });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue().map((p) => DocMapper.toPageSummaryDto(p));
  }

  @Get(':id/pages/:pageId')
  @ApiOperation({ summary: 'Get one page with its body' })
  async page(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
  ): Promise<DocPageResponseDto> {
    const result = await this.getPage.execute({ docId: id, pageId, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toPageResponseDto(result.getValue());
  }

  /**
   * The page as a PDF, rendered server-side by headless Chrome — same bytes for
   * everyone, whatever browser or printer settings they have.
   *
   * `@Res()` on purpose: every other route is wrapped in the `{ statusCode, data }`
   * envelope by the global interceptor, and a PDF is not JSON. Writing the
   * response here is what takes it out of that path. Anyone who can read the
   * page can export it — this adds no access, only a file format.
   */
  @Get(':id/pages/:pageId/pdf')
  @ApiOperation({ summary: 'Export one page as a PDF' })
  @ApiProduces('application/pdf')
  async pagePdf(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Query('locale') locale: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportPagePdf.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
      locale: locale === 'ko' ? 'ko' : 'en',
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    const { buffer, filename } = result.getValue();
    res.setHeader('Content-Type', 'application/pdf');
    // Both forms: `filename` for old clients, `filename*` so a Korean or
    // accented page title survives the trip.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  @Patch(':id/pages/:pageId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Edit a page (title, symbol, cover, body, links)' })
  async editPage(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdateDocPageDto,
  ): Promise<DocPageResponseDto> {
    const result = await this.updatePage.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
      author: { userId: auth.userId, name: auth.name },
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toPageResponseDto(result.getValue());
  }

  @Delete(':id/pages/:pageId')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Delete a page and every page nested under it' })
  async removePage(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
  ): Promise<{ ok: true; deletedIds: string[] }> {
    const result = await this.deletePage.execute({ docId: id, pageId, tenantId: auth.tenantId });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return { ok: true, deletedIds: result.getValue() };
  }

  // ── Version history ────────────────────────────────────────────────────────
  // A page autosaves continuously, so "what did this say last week" needs a
  // deliberate marker. Versions are those markers: saved by hand, read back
  // whole, and restorable without losing what's on the page now.

  @Get(':id/pages/:pageId/versions')
  @ApiOperation({ summary: "List a page's saved versions, newest first" })
  async versions(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
  ): Promise<DocPageVersionSummaryDto[]> {
    const result = await this.getVersions.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return result.getValue().map((v) => DocMapper.toVersionSummaryDto(v));
  }

  @Get(':id/pages/:pageId/versions/:versionId')
  @ApiOperation({ summary: 'Read one version, body included' })
  async version(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Param('versionId') versionId: string,
  ): Promise<DocPageVersionResponseDto> {
    const result = await this.getVersion.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
      versionId,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toVersionResponseDto(result.getValue());
  }

  @Post(':id/pages/:pageId/versions')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Save the page as it stands right now' })
  async saveVersion(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Body() dto: SaveDocPageVersionDto,
  ): Promise<DocPageVersionSummaryDto> {
    const result = await this.saveVersionUseCase.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
      author: { userId: auth.userId, name: auth.name },
      dto,
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toVersionSummaryDto(result.getValue());
  }

  @Post(':id/pages/:pageId/versions/:versionId/restore')
  @Roles(Role.ADMIN, Role.TESTER, Role.PRODUCT)
  @ApiOperation({ summary: 'Put an old version back (the current one is saved first)' })
  async restoreVersion(
    @AuthUser() auth: JwtPayload,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Param('versionId') versionId: string,
  ): Promise<DocPageResponseDto> {
    const result = await this.restoreVersionUseCase.execute({
      docId: id,
      pageId,
      tenantId: auth.tenantId,
      versionId,
      author: { userId: auth.userId, name: auth.name },
    });
    if (result.isFailure) throw new EntityNotFoundException(result.error as string);
    return DocMapper.toPageResponseDto(result.getValue());
  }
}
