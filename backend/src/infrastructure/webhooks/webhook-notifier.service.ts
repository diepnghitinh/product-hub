import { Inject, Injectable, Logger } from '@nestjs/common';
import { INotifier } from '@application/webhooks/notifier.port';
import { WebhookEvent } from '@application/app-settings/domain/webhook.types';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';

/**
 * Sends outbound webhooks (Lark-style incoming-webhook payloads) for the tenant's
 * configured hooks. Best-effort: any failure is logged, never thrown.
 */
@Injectable()
export class WebhookNotifier implements INotifier {
  private readonly logger = new Logger(WebhookNotifier.name);

  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
  ) {}

  async notify(tenantId: string, event: WebhookEvent, text: string): Promise<void> {
    try {
      const settings = await this.settings.findByTenant(tenantId);
      if (!settings) return;
      const hooks = settings.webhooks.filter(
        (w) => w.enabled && w.url && w.events.includes(event),
      );
      await Promise.all(hooks.map((w) => this.post(w.url, text)));
    } catch (err) {
      this.logger.warn(`webhook notify failed: ${(err as Error).message}`);
    }
  }

  private async post(url: string, text: string): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text } }),
      });
    } catch (err) {
      this.logger.warn(`webhook POST ${url} failed: ${(err as Error).message}`);
    }
  }
}
