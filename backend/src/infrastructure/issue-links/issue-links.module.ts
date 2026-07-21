import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IIssueLinkRepository } from '@application/issue-links/repositories/issue-link.repository';
import { IssueLinkSchema } from './entities/issue-link.schema';
import { IssueLinkRepository } from './repositories/issue-link.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'IssueLink', schema: IssueLinkSchema }])],
  providers: [{ provide: IIssueLinkRepository, useClass: IssueLinkRepository }],
  exports: [IIssueLinkRepository],
})
export class InfrastructureIssueLinksModule {}
