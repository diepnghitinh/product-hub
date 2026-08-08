import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { CreateDocPageDto, ReorderDocPagesDto, UpdateDocPageDto } from '../dtos/doc.dtos';
import { DocPageEntity } from '../domain/entities/doc-page.entity';
import { DocAccess } from '../services/doc-access';
import { DocViewer, IDocRepository } from '../repositories/doc.repository';
import { IDocPageRepository } from '../repositories/doc-page.repository';
import { IDocPageVersionRepository } from '../repositories/doc-page-version.repository';

/**
 * A page plus the doc it lives in — the linked-docs list needs the doc's title
 * to label the row and its ref to build the link, since a doc's URL is addressed
 * by ref rather than id.
 */
export interface LinkedDocPage {
  page: DocPageEntity;
  docTitle: string;
  docRef: string;
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
export class CreateDocPageUseCase implements IUsecaseExecute<
  { docId: string; tenantId: string; author: Author; viewer: DocViewer; dto: CreateDocPageDto },
  Result<DocPageEntity>
> {
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    tenantId,
    author,
    viewer,
    dto,
  }: {
    docId: string;
    tenantId: string;
    author: Author;
    viewer: DocViewer;
    dto: CreateDocPageDto;
  }): Promise<Result<DocPageEntity>> {
    const doc = await this.access.readById(tenantId, docId, viewer);
    if (!doc) return Result.fail('Doc not found');

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
export class GetDocPageUseCase implements IUsecaseExecute<
  { docId: string; pageId: string; tenantId: string; viewer: DocViewer },
  Result<DocPageEntity>
> {
  constructor(
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
    viewer: DocViewer;
  }): Promise<Result<DocPageEntity>> {
    // The doc first: this route returns a page *body*, which is the private part.
    if (!(await this.access.readById(tenantId, docId, viewer)))
      return Result.fail('Page not found');
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    return Result.ok(page);
  }
}

@Injectable()
export class UpdateDocPageUseCase implements IUsecaseExecute<
  {
    docId: string;
    pageId: string;
    tenantId: string;
    author: Author;
    viewer: DocViewer;
    dto: UpdateDocPageDto;
  },
  Result<DocPageEntity>
> {
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    author,
    viewer,
    dto,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
    author: Author;
    viewer: DocViewer;
    dto: UpdateDocPageDto;
  }): Promise<Result<DocPageEntity>> {
    if (!(await this.access.readById(tenantId, docId, viewer)))
      return Result.fail('Page not found');
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
        attachments: dto.attachments,
        style: {
          fontStyle: dto.fontStyle,
          fontSize: dto.fontSize,
          pageWidth: dto.pageWidth,
          showCover: dto.showCover,
          showTitle: dto.showTitle,
          showUpdated: dto.showUpdated,
          showLinks: dto.showLinks,
          showAttachments: dto.showAttachments,
        },
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
export class DeleteDocPageUseCase implements IUsecaseExecute<
  { docId: string; pageId: string; tenantId: string; viewer: DocViewer },
  Result<string[]>
> {
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    private readonly access: DocAccess,
  ) {}

  /** Resolves to the ids that were removed — the page and everything under it. */
  async execute({
    docId,
    pageId,
    tenantId,
    viewer,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
    viewer: DocViewer;
  }): Promise<Result<string[]>> {
    const doc = await this.access.readById(tenantId, docId, viewer);
    if (!doc) return Result.fail('Doc not found');
    const all = await this.pages.findByDoc(docId);
    if (!all.some((p) => p.id.toString() === pageId)) return Result.fail('Page not found');

    // A sub-page has no meaning without its parent, so the branch goes together.
    const ids = withDescendants(all, pageId);
    await this.pages.deleteMany(ids);
    // History follows its page — a version of a page that no longer exists is
    // unreachable by any route, so it would just accumulate.
    await this.versions.deleteByPages(ids);
    // So do its comment threads: they're anchored to text that no longer exists.
    await this.comments.deleteByDocPages(tenantId, ids);
    doc.touch();
    await this.docs.update(doc);
    return Result.ok(ids);
  }
}

@Injectable()
export class ReorderDocPagesUseCase implements IUsecaseExecute<
  { docId: string; tenantId: string; viewer: DocViewer; dto: ReorderDocPagesDto },
  Result<DocPageEntity[]>
> {
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    docId,
    tenantId,
    viewer,
    dto,
  }: {
    docId: string;
    tenantId: string;
    viewer: DocViewer;
    dto: ReorderDocPagesDto;
  }): Promise<Result<DocPageEntity[]>> {
    const doc = await this.access.readById(tenantId, docId, viewer);
    if (!doc) return Result.fail('Doc not found');

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
export class GetLinkedDocPagesUseCase implements IUsecaseExecute<
  { tenantId: string; refId: string; viewer: DocViewer },
  Result<LinkedDocPage[]>
> {
  constructor(
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly access: DocAccess,
  ) {}

  async execute({
    tenantId,
    refId,
    viewer,
  }: {
    tenantId: string;
    refId: string;
    viewer: DocViewer;
  }): Promise<Result<LinkedDocPage[]>> {
    const pages = await this.pages.findByLinkRef(tenantId, refId);
    if (!pages.length) return Result.ok([]);
    // One lookup per doc, not per page — a record usually links pages of the
    // same doc, and a tenant's doc list is small.
    //
    // This is the read that's easiest to miss: nobody asked for the private doc
    // here, they opened an *issue*, and its Docs strip would have listed the
    // page's title and linked straight to it. The `docs.has(...)` filter below
    // already existed for cross-tenant pages; routing through the gate makes it
    // do privacy too, and a page whose doc this viewer can't open simply isn't
    // in the strip.
    const docs = new Map<string, { title: string; ref: string }>();
    for (const docId of new Set(pages.map((p) => p.docId))) {
      const doc = await this.access.readById(tenantId, docId, viewer);
      if (doc) docs.set(docId, { title: doc.title, ref: doc.ref });
    }
    return Result.ok(
      pages
        .filter((p) => docs.has(p.docId))
        .map((page) => {
          const doc = docs.get(page.docId) as { title: string; ref: string };
          return { page, docTitle: doc.title, docRef: doc.ref };
        }),
    );
  }
}
