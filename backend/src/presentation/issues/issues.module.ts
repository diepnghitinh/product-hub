import { Module } from '@nestjs/common';
import { ApplicationIssuesModule } from '@application/issues/issues.module';
import { IssuesController } from './issues.controller';

@Module({
  imports: [ApplicationIssuesModule],
  controllers: [IssuesController],
})
export class IssuesPresentationModule {}
