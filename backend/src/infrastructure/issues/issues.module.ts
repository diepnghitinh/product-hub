import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IssueSchema } from './entities/issue.schema';
import { IssueRepository } from './repositories/issue.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Issue', schema: IssueSchema }])],
  providers: [{ provide: IIssueRepository, useClass: IssueRepository }],
  exports: [IIssueRepository],
})
export class InfrastructureIssuesModule {}
