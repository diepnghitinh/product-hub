import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { CreateCommentDto } from '../dtos/create-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';

export interface CreateCommentRequest {
  tenantId: string;
  bugId: string;
  authorId: string;
  authorName: string;
  dto: CreateCommentDto;
}

@Injectable()
export class CreateCommentUseCase
  implements IUsecaseExecute<CreateCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
    @Inject(IBugRepository) private readonly bugs: IBugRepository,
    @Inject(INotifier) private readonly notifier: INotifier,
  ) {}

  async execute({
    tenantId,
    bugId,
    authorId,
    authorName,
    dto,
  }: CreateCommentRequest): Promise<Result<CommentEntity>> {
    const bug = await this.bugs.findById(bugId);
    if (!bug || bug.tenantId !== tenantId) return Result.fail('Bug not found');

    const created = CommentEntity.create({
      tenantId,
      bugId,
      authorId,
      authorName,
      body: dto.body,
      mentions: dto.mentions,
      images: dto.images,
    });
    if (created.isFailure) return Result.fail(created.error as string);

    const comment = created.getValue();
    await this.comments.append(comment);

    // Best-effort @mention ping to the workspace's chat channels.
    if (comment.mentions.length) {
      const snippet =
        comment.body.length > 280 ? `${comment.body.slice(0, 280)}…` : comment.body;
      await this.notifier.notify(
        tenantId,
        WebhookEvent.COMMENT_MENTION,
        [`💬 ${authorName} mentioned you on: ${bug.title}`, snippet ? `“${snippet}”` : '']
          .filter(Boolean)
          .join('\n'),
        { mentionUserIds: comment.mentions, link: `/bugs/${bug.shortId}` },
      );
    }

    return Result.ok(comment);
  }
}
