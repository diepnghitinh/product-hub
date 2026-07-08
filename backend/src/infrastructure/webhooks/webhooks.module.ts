import { Module } from '@nestjs/common';
import { InfrastructureAppSettingsModule } from '@infrastructure/app-settings/app-settings.module';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookNotifier } from './webhook-notifier.service';

@Module({
  imports: [InfrastructureAppSettingsModule],
  providers: [{ provide: INotifier, useClass: WebhookNotifier }],
  exports: [INotifier],
})
export class InfrastructureWebhooksModule {}
