import { Module } from '@nestjs/common';
import { ApplicationIssueLinksModule } from '@application/issue-links/issue-links.module';
import { IssueLinksController } from './issue-links.controller';

@Module({
  imports: [ApplicationIssueLinksModule],
  controllers: [IssueLinksController],
})
export class IssueLinksPresentationModule {}
