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

/** A single outbound webhook (Lark-style incoming webhook URL). */
export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
}
