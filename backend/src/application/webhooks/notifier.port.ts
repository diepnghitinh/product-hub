import { WebhookEvent } from '@application/app-settings/domain/webhook.types';

export interface NotifyOptions {
  /** Workspace member ids to @mention — resolved per-hook to each provider's ID. */
  mentionUserIds?: string[];
}

/**
 * Port for firing outbound notifications. Implementations are best-effort — they
 * never throw into the calling use-case.
 */
export abstract class INotifier {
  abstract notify(
    tenantId: string,
    event: WebhookEvent,
    text: string,
    opts?: NotifyOptions,
  ): Promise<void>;
}
