import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { keepOrUpgradeShareToken, uniqueRef } from '@module-shared/utils/short-id.util';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { CreateDocDto, UpdateDocDto } from '../dtos/doc.dtos';
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
