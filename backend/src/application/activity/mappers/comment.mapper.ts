import { CommentEntity } from '../domain/entities/comment.entity';
import { CommentResponseDto } from '../dtos/comment.response.dto';

export class CommentMapper {
  static toResponseDto(comment: CommentEntity): CommentResponseDto {
    return {
      id: comment.id.toString(),
      bugId: comment.bugId,
      parentId: comment.parentId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      body: comment.body,
      mentions: comment.mentions,
      images: comment.images,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  static toResponseDtoArray(comments: CommentEntity[]): CommentResponseDto[] {
    return comments.map((c) => this.toResponseDto(c));
  }
}
