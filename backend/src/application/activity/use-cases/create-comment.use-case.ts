import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IBugRepository } from '@application/bugs/repositories/bug.repository';
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
    return Result.ok(comment);
  }
}
