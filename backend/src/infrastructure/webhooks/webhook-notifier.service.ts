import { Inject, Injectable, Logger } from '@nestjs/common';
import { INotifier, NotifyOptions } from '@application/webhooks/notifier.port';
import {
  WebhookConfig,
  WebhookEvent,
  WebhookMemberMapping,
  WebhookProvider,
} from '@application/app-settings/domain/webhook.types';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';

/**
 * Sends outbound webhooks for the tenant's configured hooks. Each hook targets a
 * provider (Lark incoming-webhook, or Telegram Bot API) and formats its own
 * payload — including @mentions of any mapped members named by the event.
 * Best-effort: any failure is logged, never thrown.
 */
@Injectable()
export class WebhookNotifier implements INotifier {
  private readonly logger = new Logger(WebhookNotifier.name);

  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
  ) {}

  async notify(
    tenantId: string,
    event: WebhookEvent,
    text: string,
    opts?: NotifyOptions,
  ): Promise<void> {
    try {
      const settings = await this.settings.findByTenant(tenantId);
      if (!settings) return;
      const hooks = settings.webhooks.filter(
        (w) => w.enabled && w.events.includes(event) && this.hasTarget(w),
      );
      const mentionIds = opts?.mentionUserIds ?? [];
      await Promise.all(hooks.map((w) => this.post(w, text, mentionIds)));
    } catch (err) {
      this.logger.warn(`webhook notify failed: ${(err as Error).message}`);
    }
  }

  /** A hook can only fire once its destination is filled in. */
  private hasTarget(w: WebhookConfig): boolean {
    return w.provider === WebhookProvider.TELEGRAM ? !!w.botToken && !!w.chatId : !!w.url;
  }

  /** Which mapped members this event should @mention on this hook. */
  private mentionsFor(hook: WebhookConfig, mentionUserIds: string[]): WebhookMemberMapping[] {
    if (!mentionUserIds.length) return [];
    return (hook.memberMappings ?? []).filter(
      (m) => m.providerUserId && mentionUserIds.includes(m.userId),
    );
  }

  private async post(hook: WebhookConfig, text: string, mentionUserIds: string[]): Promise<void> {
    const mentions = this.mentionsFor(hook, mentionUserIds);
    try {
      if (hook.provider === WebhookProvider.TELEGRAM) {
        await this.postTelegram(hook, text, mentions);
      } else {
        await this.postLark(hook, text, mentions);
      }
    } catch (err) {
      this.logger.warn(`webhook POST (${hook.provider}) failed: ${(err as Error).message}`);
    }
  }

  /** Lark incoming-webhook bot: plain text, with `<at>` tags for open-id mentions. */
  private async postLark(
    hook: WebhookConfig,
    text: string,
    mentions: WebhookMemberMapping[],
  ): Promise<void> {
    const ats = mentions
      .map((m) => `<at user_id="${m.providerUserId}">${m.displayName}</at>`)
      .join(' ');
    const content = ats ? `${text} ${ats}` : text;
    await fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
    });
  }

  /** Telegram Bot API: HTML message; mentions are `tg://user?id=` deep links. */
  private async postTelegram(
    hook: WebhookConfig,
    text: string,
    mentions: WebhookMemberMapping[],
  ): Promise<void> {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ats = mentions
      .map((m) => `<a href="tg://user?id=${esc(m.providerUserId)}">${esc(m.displayName)}</a>`)
      .join(' ');
    const body = ats ? `${esc(text)}\n${ats}` : esc(text);
    await fetch(`https://api.telegram.org/bot${hook.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: hook.chatId, text: body, parse_mode: 'HTML' }),
    });
  }
}
