import { Inject, Injectable } from '@nestjs/common';
import { UniqueEntityID } from '@core/domain';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { keepOrUpgradeShareToken, uniqueRef } from '@module-shared/utils/short-id.util';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { CreateDocDto, DuplicateDocDto, UpdateDocDto } from '../dtos/doc.dtos';
import { DOC_REF_PREFIX } from '../domain/entities/doc.props';
import { DocEntity } from '../domain/entities/doc.entity';
import { DocPageEntity } from '../domain/entities/doc-page.entity';
import { IDocRepository } from '../repositories/doc.repository';
import { IDocPageRepository } from '../repositories/doc-page.repository';
import { IDocPageVersionRepository } from '../repositories/doc-page-version.repository';

/** A doc plus the pages that belong to it — what every single-doc read returns. */
export interface DocWithPages {
  doc: DocEntity;
  pages: DocPageEntity[];
}

/** A doc and how many pages it holds — the hub list's row. */
export interface DocWithCount {
  doc: DocEntity;
  pageCount: number;
}

/** Both the DTO and the schema cap a title here. */
const MAX_TITLE = 160;

/**
 * `<title> (copy)`, kept inside the cap. A title already at the limit would push
 * the suffix past it and the write would be rejected by Mongo — so the tail of
 * the name gives way instead, since the suffix is the part that says what this is.
 */
function copyTitle(title: string): string {
  const suffix = ' (copy)';
  if (title.length + suffix.length <= MAX_TITLE) return `${title}${suffix}`;
  return `${title.slice(0, MAX_TITLE - suffix.length).trimEnd()}${suffix}`;
}

@Injectable()
export class CreateDocUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; author: { userId: string; name: string }; dto: CreateDocDto },
      Result<DocWithPages>
    >
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    tenantId,
    author,
    dto,
  }: {
    tenantId: string;
    author: { userId: string; name: string };
    dto: CreateDocDto;
  }): Promise<Result<DocWithPages>> {
    const created = DocEntity.create({
      tenantId,
      ref: await uniqueRef(DOC_REF_PREFIX, (ref) => this.docs.refExists(tenantId, ref)),
      title: dto.title,
      icon: dto.icon,
      color: dto.color,
      coverUrl: dto.coverUrl,
      tags: dto.tags,
      createdBy: author.userId,
      createdByName: author.name,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const doc = created.getValue();
    await this.docs.save(doc);

    // A doc is never empty on arrival: it opens on a first page that carries its
    // name, so writing starts immediately instead of on an empty rail.
    const firstPage = DocPageEntity.create({
      tenantId,
      docId: doc.id.toString(),
      title: doc.title,
      order: 0,
      createdBy: author.userId,
      updatedBy: author.userId,
      updatedByName: author.name,
    });
    if (firstPage.isFailure) return Result.fail(firstPage.error as string);
    const page = firstPage.getValue();
    await this.pages.save(page);

    return Result.ok({ doc, pages: [page] });
  }
}

/**
 * Copy a doc and every page in it — the whole tree, in one go.
 *
 * What travels is the writing: each page's body, its symbol and cover, its files
 * and its Page Styles, in the same nesting and the same order. What deliberately
 * does not: the share link, the version history, the comment threads and the
 * links to issues / roadmap items. Each of those is a statement about the
 * *original* — a granted URL, a record of how those words got there, a
 * conversation anchored in them, a claim on a work item — and re-issuing it for a
 * copy is not what "duplicate" asks for. See the notes at each one below.
 */
@Injectable()
export class DuplicateDocUseCase
  implements
    IUsecaseExecute<
      {
        id: string;
        tenantId: string;
        author: { userId: string; name: string };
        dto: DuplicateDocDto;
      },
      Result<DocWithPages>
    >
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    id,
    tenantId,
    author,
    dto,
  }: {
    id: string;
    tenantId: string;
    author: { userId: string; name: string };
    dto: DuplicateDocDto;
  }): Promise<Result<DocWithPages>> {
    // `id` is whatever the URL carried — a `DOC-…` ref or the uuid.
    const source = await this.docs.findByIdOrRef(tenantId, id);
    if (!source || source.tenantId !== tenantId) return Result.fail('Doc not found');

    const created = DocEntity.create({
      tenantId,
      ref: await uniqueRef(DOC_REF_PREFIX, (ref) => this.docs.refExists(tenantId, ref)),
      title: dto.title?.trim() || copyTitle(source.title),
      icon: source.icon,
      color: source.color,
      coverUrl: source.coverUrl,
      tags: source.tags,
      // The copy belongs to whoever made it, not to whoever wrote the original.
      createdBy: author.userId,
      createdByName: author.name,
      // Sharing stays off (the entity's default): a share token is an access
      // grant handed out for one doc, and minting a second public URL for the
      // same words — silently, from a menu item — is not something to infer.
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const doc = created.getValue();
    const docId = doc.id.toString();

    const sourcePages = await this.pages.findByDoc(source.id.toString());
    // Every new id first, so a child's `parentId` can be remapped in a single
    // pass. A parent that isn't in the map (an orphaned page) lands at top level
    // rather than pointing back into the doc we copied from.
    const newIds = new Map(sourcePages.map((p) => [p.id.toString(), new UniqueEntityID()]));

    const copies: DocPageEntity[] = [];
    for (const page of sourcePages) {
      const copy = DocPageEntity.create(
        {
          tenantId,
          docId,
          parentId: newIds.get(page.parentId)?.toString() ?? '',
          title: page.title,
          icon: page.icon,
          color: page.color,
          coverUrl: page.coverUrl,
          content: page.content,
          // Files come along: an attachment is part of the writing. Both pages
          // point at the same stored upload — nothing is copied in the bucket,
          // and removing the chip from one leaves the other's alone.
          attachments: page.attachments,
          // `links` are left behind on purpose. A link is the original page's
          // claim on an issue or a roadmap item; copying it would put a second,
          // identical row in that record's Docs section for somebody else to
          // clean up. Link the copy from the copy if that's what was meant.
          style: {
            fontStyle: page.fontStyle,
            fontSize: page.fontSize,
            pageWidth: page.pageWidth,
            showCover: page.showCover,
            showTitle: page.showTitle,
            showUpdated: page.showUpdated,
            showLinks: page.showLinks,
            showAttachments: page.showAttachments,
          },
          order: page.order,
          createdBy: author.userId,
          updatedBy: author.userId,
          updatedByName: author.name,
        },
        newIds.get(page.id.toString()),
      );
      if (copy.isFailure) return Result.fail(copy.error as string);
      copies.push(copy.getValue());
    }

    // The doc lands first: a page whose doc doesn't exist is unreachable, while
    // a doc that briefly holds no pages just reads as empty.
    await this.docs.save(doc);
    await this.pages.saveMany(copies);
    // Version history and comment threads stay with the pages they were written
    // against — a copy starts with a clean history and no open threads. So does
    // its collaborative session: a new page id is a new room, which seeds itself
    // from the HTML above the first time somebody opens it.
    return Result.ok({ doc, pages: copies });
  }
}

@Injectable()
export class GetDocsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<DocWithCount[]>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({ tenantId }: { tenantId: string }): Promise<Result<DocWithCount[]>> {
    const docs = await this.docs.findByTenant(tenantId);
    if (!docs.length) return Result.ok([]);
    const counts = await this.pages.countByDocIds(docs.map((d) => d.id.toString()));
    return Result.ok(docs.map((doc) => ({ doc, pageCount: counts[doc.id.toString()] ?? 0 })));
  }
}

@Injectable()
export class GetDocUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<DocWithPages>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({
    id,
    tenantId,
  }: {
    id: string;
    tenantId: string;
  }): Promise<Result<DocWithPages>> {
    // `id` is whatever the URL carried — a `DOC-…` ref or the uuid. Pages are
    // always keyed by the uuid, so read it back off the resolved doc.
    const doc = await this.docs.findByIdOrRef(tenantId, id);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');
    return Result.ok({ doc, pages: await this.pages.findByDoc(doc.id.toString()) });
  }
}

@Injectable()
export class UpdateDocUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; dto: UpdateDocDto }, Result<DocEntity>>
{
  constructor(@Inject(IDocRepository) private readonly docs: IDocRepository) {}

  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: UpdateDocDto;
  }): Promise<Result<DocEntity>> {
    const doc = await this.docs.findByIdOrRef(tenantId, id);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');
    doc.applyMeta(dto);
    await this.docs.update(doc);
    return Result.ok(doc);
  }
}

@Injectable()
export class DeleteDocUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<void>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(IDocPageVersionRepository) private readonly versions: IDocPageVersionRepository,
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
  ) {}

  async execute({ id, tenantId }: { id: string; tenantId: string }): Promise<Result<void>> {
    const doc = await this.docs.findByIdOrRef(tenantId, id);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');
    // Everything below is keyed by the uuid, never the ref.
    const docId = doc.id.toString();
    // Pages first: a doc without pages is recoverable noise, orphan pages are not.
    await this.pages.deleteByDoc(docId);
    await this.versions.deleteByDoc(docId);
    await this.comments.deleteByDoc(tenantId, docId);
    await this.docs.delete(docId);
    return Result.ok();
  }
}

@Injectable()
export class SetDocSharingUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; enabled: boolean }, Result<DocEntity>>
{
  constructor(@Inject(IDocRepository) private readonly docs: IDocRepository) {}

  async execute({
    id,
    tenantId,
    enabled,
  }: {
    id: string;
    tenantId: string;
    enabled: boolean;
  }): Promise<Result<DocEntity>> {
    const doc = await this.docs.findByIdOrRef(tenantId, id);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');
    // Reuse the existing token when re-enabling so old links keep working
    // (legacy UUID tokens are swapped for a short one — see the helper).
    if (enabled) doc.enableSharing(keepOrUpgradeShareToken(doc.publicToken));
    else doc.disableSharing();
    await this.docs.update(doc);
    return Result.ok(doc);
  }
}

/** Resolve a public share token into a read-only doc with every page's body. */
@Injectable()
export class GetPublicDocUseCase
  implements IUsecaseExecute<{ token: string }, Result<DocWithPages>>
{
  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
  ) {}

  async execute({ token }: { token: string }): Promise<Result<DocWithPages>> {
    const doc = await this.docs.findByPublicToken(token);
    if (!doc) return Result.fail('This link is not available');
    return Result.ok({ doc, pages: await this.pages.findByDoc(doc.id.toString()) });
  }
}
