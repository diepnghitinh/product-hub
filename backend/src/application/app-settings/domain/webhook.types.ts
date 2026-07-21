/** Chat platforms an outbound webhook can post to. */
export enum WebhookProvider {
  LARK = 'lark',
  TELEGRAM = 'telegram',
}

export const WEBHOOK_PROVIDERS: WebhookProvider[] = [
  WebhookProvider.LARK,
  WebhookProvider.TELEGRAM,
];

/** Events that can trigger an outbound webhook. */
export enum WebhookEvent {
  BUG_CREATED = 'bug-created',
  BUG_ASSIGNED = 'bug-assigned',
  COMMENT_MENTION = 'comment-mention',
}

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  WebhookEvent.BUG_CREATED,
  WebhookEvent.BUG_ASSIGNED,
  WebhookEvent.COMMENT_MENTION,
];

/**
 * Maps a workspace member to their identity on the chat platform, so an event
 * that names them can @mention them. `providerUserId` is a Lark `open_id` or a
 * Telegram numeric user id; `displayName` is the fallback text shown in the ping.
 */
export interface WebhookMemberMapping {
  userId: string;
  providerUserId: string;
  displayName: string;
}

/**
 * A single outbound webhook — one per chat provider. Lark posts to `url` (an
 * incoming-webhook URL); Telegram uses `botToken` + `chatId` against the Bot API.
 */
export interface WebhookConfig {
  id: string;
  provider: WebhookProvider;
  name: string;
  url: string;
  botToken?: string;
  chatId?: string;
  events: WebhookEvent[];
  enabled: boolean;
  memberMappings?: WebhookMemberMapping[];
}

/** Back-fill `provider` for hooks stored before the field existed (all Lark). */
export function normalizeWebhook(hook: WebhookConfig): WebhookConfig {
  return { ...hook, provider: hook.provider ?? WebhookProvider.LARK };
}
