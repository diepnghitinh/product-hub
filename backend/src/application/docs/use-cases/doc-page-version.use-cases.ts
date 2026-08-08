import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { SaveDocPageVersionDto } from '../dtos/doc.dtos';
import { DocPageEntity } from '../domain/entities/doc-page.entity';
import { DocPageVersionEntity } from '../domain/entities/doc-page-version.entity';
import { DocAccess } from '../services/doc-access';
import { DocViewer, IDocRepository } from '../repositories/doc.repository';
import { IDocPageRepository } from '../repositories/doc-page.repository';
import { IDocPageVersionRepository } from '../repositories/doc-page-version.repository';

interface Author {
  userId: string;
  name: string;
}

/**
 * A page's id, scoped to its doc, tenant and reader — every route here takes all
 * four. `viewer` is on the shared scope rather than on each use-case so that a
 * fifth version route can't be added without deciding who may see it: history is
 * the whole text of a private page, one save at a time.
 */
interface PageScope {
  docId: string;
  pageId: string;
  tenantId: string;
  viewer: DocViewer;
}

/**
 * Freeze a page as it stands. Shared by the explicit "Save version" action and
 * by a restore, which snapshots the live page before overwriting it — that's
 * what makes going back to an old version reversible rather than a one-way door.
 */
function snapshot(page: DocPageEntity, author: Author, label: string): Result<DocPageVersionEntity> {
  return DocPageVersionEntity.create({
    tenantId: page.tenantId,
    docId: page.docId,
    pageId: page.id.toString(),
    title: page.title,
    content: page.content,
    label,
    createdBy: author.userId,
    createdByName: author.name,
  });
}

@Injectable()
export class SaveDocPageVersionUseCase
  implements
    IUsecaseExecute<
      PageScope & { author: Author; dto: SaveDocPageVersionDto },
      Result<DocPageVersionEntity>
    >
{
  constructor(
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
    author,
    dto,
  }: PageScope & { author: Author; dto: SaveDocPageVersionDto }): Promise<
    Result<DocPageVersionEntity>
  > {
    if (!(await this.access.readById(tenantId, docId, viewer)))
      return Result.fail('Page not found');
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    const created = snapshot(page, author, dto.label ?? '');
    if (created.isFailure) return Result.fail(created.error as string);
    const version = created.getValue();
    await this.versions.save(version);
    return Result.ok(version);
  }
}

@Injectable()
export class GetDocPageVersionsUseCase
  implements IUsecaseExecute<PageScope, Result<DocPageVersionEntity[]>>
{
  constructor(
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
  }: PageScope): Promise<Result<DocPageVersionEntity[]>> {
    if (!(await this.access.readById(tenantId, docId, viewer)))
      return Result.fail('Page not found');
    // Read through the page, so a version can't be reached by guessing an id
    // from another workspace.
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    return Result.ok(await this.versions.findByPage(pageId));
  }
}

@Injectable()
export class GetDocPageVersionUseCase
  implements IUsecaseExecute<PageScope & { versionId: string }, Result<DocPageVersionEntity>>
{
  constructor(
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
    versionId,
  }: PageScope & { versionId: string }): Promise<Result<DocPageVersionEntity>> {
    // This one returns a full body, so it's the version route that matters most.
    if (!(await this.access.readById(tenantId, docId, viewer))) {
      return Result.fail('Version not found');
    }
    const version = await this.versions.findById(versionId);
    if (
      !version ||
      version.tenantId !== tenantId ||
      version.docId !== docId ||
      version.pageId !== pageId
    ) {
      return Result.fail('Version not found');
    }
    return Result.ok(version);
  }
}

/**
 * Put an old version back. The live page's current state is saved as a version
 * of its own first, so nothing is lost by looking backwards and deciding to stay.
 */
@Injectable()
export class RestoreDocPageVersionUseCase
  implements
    IUsecaseExecute<PageScope & { versionId: string; author: Author }, Result<DocPageEntity>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
    versionId,
    author,
  }: PageScope & { versionId: string; author: Author }): Promise<Result<DocPageEntity>> {
    if (!(await this.access.readById(tenantId, docId, viewer)))
      return Result.fail('Page not found');
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    const version = await this.versions.findById(versionId);
    if (!version || version.tenantId !== tenantId || version.pageId !== pageId) {
      return Result.fail('Version not found');
    }

    const backup = snapshot(page, author, 'Before restore');
    if (backup.isFailure) return Result.fail(backup.error as string);
    await this.versions.save(backup.getValue());

    // Title travels with the body: a version is a snapshot of the writing, and
    // restoring the text under a title it never had reads as the wrong document.
    // (`|| page.title` because a page's title can never be blank, and applyEdit
    // rejects one — an old snapshot taken loosely shouldn't be able to 500.)
    page.applyEdit({ title: version.title || page.title, content: version.content }, author);
    await this.pages.update(page);

    const doc = await this.docs.findById(docId);
    if (doc) {
      doc.touch();
      await this.docs.update(doc);
    }
    return Result.ok(page);
  }
}
