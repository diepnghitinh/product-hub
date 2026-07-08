import { WebhookEvent } from '@application/app-settings/domain/webhook.types';

/**
 * Port for firing outbound notifications. Implementations are best-effort — they
 * never throw into the calling use-case.
 */
export abstract class INotifier {
  abstract notify(tenantId: string, event: WebhookEvent, text: string): Promise<void>;
}
