import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ICommentRepository } from '@application/activity/repositories/comment.repository';
import { CommentSchema } from './entities/comment.schema';
import { CommentRepository } from './repositories/comment.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Comment', schema: CommentSchema }])],
  providers: [{ provide: ICommentRepository, useClass: CommentRepository }],
  exports: [ICommentRepository],
})
export class InfrastructureActivityModule {}
