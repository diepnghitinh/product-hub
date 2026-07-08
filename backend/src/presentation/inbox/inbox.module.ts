import { Module } from '@nestjs/common';
import { ApplicationInboxModule } from '@application/inbox/inbox.module';
import { InboxController } from './inbox.controller';

@Module({
  imports: [ApplicationInboxModule],
  controllers: [InboxController],
})
export class InboxPresentationModule {}
