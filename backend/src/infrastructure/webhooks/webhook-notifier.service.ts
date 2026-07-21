import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INotifier, NotifyOptions } from '@application/webhooks/notifier.port';
import {
  WebhookConfig,
  WebhookEvent,
  WebhookMemberMapping,
  WebhookProvider,
} from '@application/app-settings/domain/webhook.types';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';

/** Hard ceiling on a single outbound POST so a hung channel never stalls a save. */
const WEBHOOK_TIMEOUT_MS = 6000;

/**
 * Sends outbound webhooks for the tenant's configured hooks. Each hook targets a
 * provider (Lark incoming-webhook, or Telegram Bot API) and formats its own
 * payload — a multi-line template with @mentions of any mapped members named by
 * the event and a `Link:` back to the item. Best-effort: every failure is logged
 * (including Lark's HTTP-200-but-non-zero-`code` app errors), never thrown.
 */
@Injectable()
export class WebhookNotifier implements INotifier {
  private readonly logger = new Logger(WebhookNotifier.name);
  /** Workspace base URL used to turn a relative `link` into a tappable URL. */
  private readonly baseUrl: string;

  constructor(
    @Inject(IAppSettingsRepository) private readonly settings: IAppSettingsRepository,
    config: ConfigService,
  ) {
    this.baseUrl = (config.get<string>('APP_BASE_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

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
      const link = opts?.link ? `${this.baseUrl}${opts.link}` : '';
      await Promise.all(hooks.map((w) => this.post(w, text, mentionIds, link)));
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

  private async post(
    hook: WebhookConfig,
    text: string,
    mentionUserIds: string[],
    link: string,
  ): Promise<void> {
    const mentions = this.mentionsFor(hook, mentionUserIds);
    try {
      if (hook.provider === WebhookProvider.TELEGRAM) {
        await this.postTelegram(hook, text, mentions, link);
      } else {
        await this.postLark(hook, text, mentions, link);
      }
    } catch (err) {
      this.logger.warn(`webhook POST (${hook.provider}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * POSTs a Lark text message with a hard timeout and surfaces delivery failures.
   * Lark replies HTTP 200 even for app-level errors (bad webhook, signature
   * required, malformed `<at>`), returning a non-zero `code` — so we inspect the
   * body and log it; otherwise a misconfigured webhook fails silently and just
   * looks like "nothing was sent".
   */
  private async postLark(
    hook: WebhookConfig,
    text: string,
    mentions: WebhookMemberMapping[],
    link: string,
  ): Promise<void> {
    const ats = mentions
      .map((m) => `<at user_id="${m.providerUserId}">${m.displayName}</at>`)
      .join(' ');
    const content = [text, ats, link ? `Link: ${link}` : ''].filter(Boolean).join('\n');

    const res = await this.fetchWithTimeout(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
    });
    if (!res.ok) {
      this.logger.warn(`Lark HTTP ${res.status}`);
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { code?: number; msg?: string }
      | null;
    // `code: 0` means delivered; anything else is an app-level error.
    if (data && data.code !== undefined && data.code !== 0) {
      this.logger.warn(`Lark error code ${data.code}: ${data.msg ?? ''}`);
    }
  }

  /** Telegram Bot API: HTML message; mentions are `tg://user?id=` deep links. */
  private async postTelegram(
    hook: WebhookConfig,
    text: string,
    mentions: WebhookMemberMapping[],
    link: string,
  ): Promise<void> {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ats = mentions
      .map((m) => `<a href="tg://user?id=${esc(m.providerUserId)}">${esc(m.displayName)}</a>`)
      .join(' ');
    const body = [esc(text), ats, link ? `Link: ${esc(link)}` : ''].filter(Boolean).join('\n');

    const res = await this.fetchWithTimeout(
      `https://api.telegram.org/bot${hook.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: hook.chatId, text: body, parse_mode: 'HTML' }),
      },
    );
    if (!res.ok) this.logger.warn(`Telegram HTTP ${res.status}`);
  }

  /** `fetch` with an abort-based timeout so a hung channel can't stall a save. */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
