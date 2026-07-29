import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute, Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IDocPageRepository } from '@application/docs/repositories/doc-page.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateDocCommentDto } from '../dtos/doc-comment.dtos';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import {
  DocPageCommentCount,
  ICommentRepository,
} from '../repositories/comment.repository';
import { COMMENT_FORBIDDEN, COMMENT_DELETE_FORBIDDEN } from './issue-comment.use-cases';

/**
 * Doc-page comment threads — the docs-side twin of the issue and roadmap-item
 * use-cases, sharing the same `Comment` collection (a comment carries an
 * `issueId` OR a `roadmapItemId` OR a `docPageId`).
 *
 * What's different here is the *anchor*. A doc comment usually points at a passage
 * someone highlighted, carried as a text quote rather than a position — see
 * `CreateDocCommentDto`. The server only stores it; finding the passage again is
 * the reader's job, because only the browser has the rendered page to search.
 *
 * Reading and writing are open to everyone signed in, including Developers, who
 * can't edit a doc's body: the whole point is that the people who read a spec can
 * ask about it. Editing and deleting stay author-or-admin, as everywhere else.
 */

/** Only a thread's author, an admin or product can tick it off. */
export const COMMENT_RESOLVE_FORBIDDEN = 'You can only resolve your own threads';

export interface CreateDocCommentRequest {
  tenantId: string;
  docId: string;
  pageId: string;
  authorId: string;
  authorName: string;
  dto: CreateDocCommentDto;
}

@Injectable()
export class CreateDocCommentUseCase
  implements IUsecaseExecute<CreateDocCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    docId,
    pageId,
    authorId,
    authorName,
    dto,
  }: CreateDocCommentRequest): Promise<Result<CommentEntity>> {
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId)
      return Result.fail('Doc page not found');

    // Resolve a reply to a top-level comment on this page; threads stay one level
    // deep and an unknown/foreign parent degrades to a top-level comment.
    let parentId = '';
    if (dto.parentId) {
      const parent = await this.comments.findById(tenantId, dto.parentId);
      if (parent && parent.docPageId === pageId)
        parentId = parent.parentId || parent.id.toString();
    }

    const created = CommentEntity.create({
      tenantId,
      docId,
      docPageId: pageId,
      // A reply belongs to its root's passage, not to whatever happened to be
      // selected when it was typed — so only a root carries an anchor.
      ...(parentId
        ? {}
        : {
            anchorExact: dto.anchorExact,
            anchorPrefix: dto.anchorPrefix,
            anchorSuffix: dto.anchorSuffix,
            anchorStart: dto.anchorStart,
          }),
      parentId,
      authorId,
      authorName,
      body: dto.body,
      mentions: dto.mentions,
      images: dto.images,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await this.comments.append(comment);

    // Best-effort @mention ping to the workspace's chat channels — same as every
    // other thread. The link opens the page with this comment focused.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [
          `💬 ${authorName} mentioned you on: ${page.title || 'Untitled'}`,
          comment.anchorExact ? `“${comment.anchorExact}”` : '',
          snippet,
        ]
          .filter(Boolean)
          .join('\n'),
        {
          mentionUserIds: comment.mentions,
          link: `/docs/${docId}/${pageId}?comment=${comment.id.toString()}`,
        },
      );
    }

    return Result.ok(comment);
  }
}

export interface GetDocCommentsRequest {
  tenantId: string;
  pageId: string;
}

@Injectable()
export class GetDocCommentsUseCase
  implements IUsecaseExecute<GetDocCommentsRequest, Result<CommentEntity[]>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({ tenantId, pageId }: GetDocCommentsRequest): Promise<Result<CommentEntity[]>> {
    return Result.ok(await this.comments.findByDocPage(tenantId, pageId));
  }
}

export interface GetDocCommentCountsRequest {
  tenantId: string;
  docId: string;
}

/** Open threads per page, for the badges in a doc's page rail. */
@Injectable()
export class GetDocCommentCountsUseCase
  implements IUsecaseExecute<GetDocCommentCountsRequest, Result<DocPageCommentCount[]>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    docId,
  }: GetDocCommentCountsRequest): Promise<Result<DocPageCommentCount[]>> {
    return Result.ok(await this.comments.countOpenByDoc(tenantId, docId));
  }
}

export interface UpdateDocCommentRequest {
  tenantId: string;
  pageId: string;
  commentId: string;
  userId: string;
  role: Role;
  dto: UpdateCommentDto;
}

@Injectable()
export class UpdateDocCommentUseCase
  implements IUsecaseExecute<UpdateDocCommentRequest, Result<CommentEntity>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    pageId,
    commentId,
    userId,
    role,
    dto,
  }: UpdateDocCommentRequest): Promise<Result<CommentEntity>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.docPageId !== pageId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_FORBIDDEN);
    }
    const edited = comment.edit({ body: dto.body, mentions: dto.mentions, images: dto.images });
    if (edited.isFailure) return Result.fail(edited.error as string);
    await this.comments.update(comment);
    return Result.ok(comment);
  }
}

export interface ResolveDocCommentRequest {
  tenantId: string;
  pageId: string;
  commentId: string;
  userId: string;
  userName: string;
  role: Role;
  resolved: boolean;
}

/**
 * Tick a thread off (or reopen it). Only the root carries the flag — a reply
 * follows the thread it's in — so resolving a reply resolves its root instead of
 * quietly doing nothing.
 */
@Injectable()
export class ResolveDocCommentUseCase
  implements IUsecaseExecute<ResolveDocCommentRequest, Result<CommentEntity>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    pageId,
    commentId,
    userId,
    userName,
    role,
    resolved,
  }: ResolveDocCommentRequest): Promise<Result<CommentEntity>> {
    const target = await this.comments.findById(tenantId, commentId);
    if (!target || target.docPageId !== pageId) return Result.fail('Comment not found');

    const root = target.parentId
      ? await this.comments.findById(tenantId, target.parentId)
      : target;
    if (!root || root.docPageId !== pageId) return Result.fail('Comment not found');

    if (root.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_RESOLVE_FORBIDDEN);
    }
    root.setResolved(resolved, { userId, name: userName });
    await this.comments.update(root);
    return Result.ok(root);
  }
}

export interface DeleteDocCommentRequest {
  tenantId: string;
  pageId: string;
  commentId: string;
  userId: string;
  role: Role;
}

@Injectable()
export class DeleteDocCommentUseCase
  implements IUsecaseExecute<DeleteDocCommentRequest, Result<void>>
{
  constructor(@Inject(ICommentRepository) private readonly comments: ICommentRepository) {}

  async execute({
    tenantId,
    pageId,
    commentId,
    userId,
    role,
  }: DeleteDocCommentRequest): Promise<Result<void>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.docPageId !== pageId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_DELETE_FORBIDDEN);
    }
    // Deleting a root takes its replies with it — a reply with no question above
    // it reads as a non-sequitur, and it could never be reached in the sidebar.
    if (!comment.parentId) {
      const thread = await this.comments.findByDocPage(tenantId, pageId);
      await Promise.all(
        thread
          .filter((c) => c.parentId === commentId)
          .map((c) => this.comments.delete(c.id.toString())),
      );
    }
    await this.comments.delete(commentId);
    return Result.ok();
  }
}
