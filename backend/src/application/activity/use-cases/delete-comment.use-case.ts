import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Role } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { ICommentRepository } from '../repositories/comment.repository';

export interface DeleteCommentRequest {
  tenantId: string;
  bugId: string;
  commentId: string;
  userId: string;
  role: Role;
}

/** Sentinel prefix so the controller can map an authorization failure to 403. */
export const COMMENT_DELETE_FORBIDDEN = 'You can only delete your own comments';

@Injectable()
export class DeleteCommentUseCase
  implements IUsecaseExecute<DeleteCommentRequest, Result<void>>
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
  }: DeleteCommentRequest): Promise<Result<void>> {
    const comment = await this.comments.findById(tenantId, commentId);
    if (!comment || comment.bugId !== bugId) return Result.fail('Comment not found');
    if (comment.authorId !== userId && role !== Role.ADMIN) {
      return Result.fail(COMMENT_DELETE_FORBIDDEN);
    }

    await this.comments.delete(commentId);
    return Result.ok();
  }
}
