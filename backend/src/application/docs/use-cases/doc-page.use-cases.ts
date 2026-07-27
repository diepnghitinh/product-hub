import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { CreateDocPageDto, ReorderDocPagesDto, UpdateDocPageDto } from '../dtos/doc.dtos';
import { DocPageEntity } from '../domain/entities/doc-page.entity';
import { IDocRepository } from '../repositories/doc.repository';
import { IDocPageRepository } from '../repositories/doc-page.repository';
import { IDocPageVersionRepository } from '../repositories/doc-page-version.repository';

/** A page plus the doc it lives in — the linked-docs list needs both titles. */
export interface LinkedDocPage {
  page: DocPageEntity;
  docTitle: string;
}

interface Author {
  userId: string;
  name: string;
}

/** Ids of `pageId` and everything nested under it, at any depth. */
function withDescendants(pages: DocPageEntity[], pageId: string): string[] {
  const byParent = new Map<string, DocPageEntity[]>();
  for (const p of pages) {
    const siblings = byParent.get(p.parentId) ?? [];
    siblings.push(p);
    byParent.set(p.parentId, siblings);
  }
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    for (const child of byParent.get(id) ?? []) walk(child.id.toString());
  };
  walk(pageId);
  return ids;
}

@Injectable()
export class CreateDocPageUseCase
  implements
    IUsecaseExecute<
      { docId: string; tenantId: string; author: Author; dto: CreateDocPageDto },
      Result<DocPageEntity>
    >
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    docId,
    tenantId,
    author,
    dto,
  }: {
    docId: string;
    tenantId: string;
    author: Author;
    dto: CreateDocPageDto;
  }): Promise<Result<DocPageEntity>> {
    const doc = await this.docs.findById(docId);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');

    const existing = await this.pages.findByDoc(docId);
    const parentId = dto.parentId || '';
    // Nesting under a page from another doc would strand the new page.
    if (parentId && !existing.some((p) => p.id.toString() === parentId)) {
      return Result.fail('Parent page not found');
    }
    // Land last among its siblings, which is where the click happened.
    const lastOrder = existing
      .filter((p) => p.parentId === parentId)
      .reduce((max, p) => Math.max(max, p.order), -1);

    const created = DocPageEntity.create({
      tenantId,
      docId,
      parentId,
      title: dto.title?.trim() || 'Untitled',
      content: dto.content ?? '',
      order: lastOrder + 1,
      createdBy: author.userId,
      updatedBy: author.userId,
      updatedByName: author.name,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const page = created.getValue();
    await this.pages.save(page);
    // The hub sorts by activity, so adding a page counts as touching the doc.
    doc.touch();
    await this.docs.update(doc);
    return Result.ok(page);
  }
}

@Injectable()
export class GetDocPageUseCase
  implements
    IUsecaseExecute<{ docId: string; pageId: string; tenantId: string }, Result<DocPageEntity>>
{
  constructor(@Inject(IDocPageRepository) private readonly pages: IDocPageRepository) {}

  async execute({
    docId,
    pageId,
    tenantId,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
  }): Promise<Result<DocPageEntity>> {
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    return Result.ok(page);
  }
}

@Injectable()
export class UpdateDocPageUseCase
  implements
    IUsecaseExecute<
      {
        docId: string;
        pageId: string;
        tenantId: string;
        author: Author;
        dto: UpdateDocPageDto;
      },
      Result<DocPageEntity>
    >
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    author,
    dto,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
    author: Author;
    dto: UpdateDocPageDto;
  }): Promise<Result<DocPageEntity>> {
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    page.applyEdit(
      {
        title: dto.title,
        icon: dto.icon,
        color: dto.color,
        coverUrl: dto.coverUrl,
        content: dto.content,
        links: dto.links,
      },
      author,
    );
    await this.pages.update(page);

    const doc = await this.docs.findById(docId);
    if (doc) {
      doc.touch();
      await this.docs.update(doc);
    }
    return Result.ok(page);
  }
}

@Injectable()
export class DeleteDocPageUseCase
  implements
    IUsecaseExecute<{ docId: string; pageId: string; tenantId: string }, Result<string[]>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
  ) {}

  /** Resolves to the ids that were removed — the page and everything under it. */
  async execute({
    docId,
    pageId,
    tenantId,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
  }): Promise<Result<string[]>> {
    const doc = await this.docs.findById(docId);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');
    const all = await this.pages.findByDoc(docId);
    if (!all.some((p) => p.id.toString() === pageId)) return Result.fail('Page not found');

    // A sub-page has no meaning without its parent, so the branch goes together.
    const ids = withDescendants(all, pageId);
    await this.pages.deleteMany(ids);
    // History follows its page — a version of a page that no longer exists is
    // unreachable by any route, so it would just accumulate.
    await this.versions.deleteByPages(ids);
    doc.touch();
    await this.docs.update(doc);
    return Result.ok(ids);
  }
}

@Injectable()
export class ReorderDocPagesUseCase
  implements
    IUsecaseExecute<
      { docId: string; tenantId: string; dto: ReorderDocPagesDto },
      Result<DocPageEntity[]>
    >
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    docId,
    tenantId,
    dto,
  }: {
    docId: string;
    tenantId: string;
    dto: ReorderDocPagesDto;
  }): Promise<Result<DocPageEntity[]>> {
    const doc = await this.docs.findById(docId);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');

    const all = await this.pages.findByDoc(docId);
    const byId = new Map(all.map((p) => [p.id.toString(), p]));
    for (const pos of dto.pages) {
      if (!byId.has(pos.id)) return Result.fail('Page not found');
      if (pos.parentId && !byId.has(pos.parentId)) return Result.fail('Parent page not found');
    }

    // Walk the *proposed* tree: dropping a page onto its own descendant would
    // detach that whole branch from the doc, and it would never render again.
    const nextParent = new Map<string, string>(
      all.map((p) => [p.id.toString(), p.parentId] as const),
    );
    for (const pos of dto.pages) nextParent.set(pos.id, pos.parentId || '');
    for (const pos of dto.pages) {
      let cursor = pos.parentId || '';
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === pos.id) return Result.fail('A page cannot be nested inside itself');
        if (seen.has(cursor)) break; // pre-existing cycle: don't spin on it
        seen.add(cursor);
        cursor = nextParent.get(cursor) ?? '';
      }
    }

    const moved: DocPageEntity[] = [];
    for (const pos of dto.pages) {
      const page = byId.get(pos.id) as DocPageEntity;
      page.moveTo(pos.parentId || '', pos.order);
      moved.push(page);
    }
    await this.pages.updateMany(moved);
    doc.touch();
    await this.docs.update(doc);
    return Result.ok(await this.pages.findByDoc(docId));
  }
}

/** Every doc page attached to one record (an issue or a roadmap item). */
@Injectable()
export class GetLinkedDocPagesUseCase
  implements IUsecaseExecute<{ tenantId: string; refId: string }, Result<LinkedDocPage[]>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    tenantId,
    refId,
  }: {
    tenantId: string;
    refId: string;
  }): Promise<Result<LinkedDocPage[]>> {
    const pages = await this.pages.findByLinkRef(tenantId, refId);
    if (!pages.length) return Result.ok([]);
    // One lookup per doc, not per page — a record usually links pages of the
    // same doc, and a tenant's doc list is small.
    const titles = new Map<string, string>();
    for (const docId of new Set(pages.map((p) => p.docId))) {
      const doc = await this.docs.findById(docId);
      if (doc && doc.tenantId === tenantId) titles.set(docId, doc.title);
    }
    return Result.ok(
      pages
        .filter((p) => titles.has(p.docId))
        .map((page) => ({ page, docTitle: titles.get(page.docId) as string })),
    );
  }
}
