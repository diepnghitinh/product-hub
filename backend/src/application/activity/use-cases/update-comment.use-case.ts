import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UpdateCommentDto } from '../dtos/update-comment.dto';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';

export interface UpdateCommentRequest {
  tenantId: string;
  bugId: string;
  commentId: string;
  userId: string;
  role: Role;
  dto: UpdateCommentDto;
}

/** Sentinel prefix so the controller can map an authorization failure to 403. */
export const COMMENT_FORBIDDEN = 'You can only edit your own comments';

@Injectable()
export class UpdateCommentUseCase
  implements IUsecaseExecute<UpdateCommentRequest, Result<CommentEntity>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
  ) {}

  async execute({
    tenantId,
    bugId,
    commentId,
    userId,
    role,
    dto,
  }: UpdateCommentRequest): Promise<Result<CommentEntity>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.bugId !== bugId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN && role !== Role.PRODUCT) {
      return Result.fail(COMMENT_FORBIDDEN);
    }

    const edited = comment.edit({ body: dto.body, mentions: dto.mentions, images: dto.images });
    if (edited.isFailure) return Result.fail(edited.error as string);

    await this.comments.update(comment);
    return Result.ok(comment);
  }
}
