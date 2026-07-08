import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { CommentEntity } from '../domain/entities/comment.entity';
import { ICommentRepository } from '../repositories/comment.repository';

export interface GetCommentsRequest {
  tenantId: string;
  bugId: string;
}

@Injectable()
export class GetCommentsUseCase
  implements IUsecaseExecute<GetCommentsRequest, Result<CommentEntity[]>>
{
  constructor(
    @Inject(ICommentRepository) private readonly comments: ICommentRepository,
  ) {}

  async execute({ tenantId, bugId }: GetCommentsRequest): Promise<Result<CommentEntity[]>> {
    const comments = await this.comments.findByBug(tenantId, bugId);
    return Result.ok(comments);
  }
}
