/**
 * The fixed quick-reaction set. The values are the stored/serialized emoji and
 * are mirrored by the frontend. Enforced server-side so only these can ever be
 * written — the bar is a fixed palette, not a free emoji picker.
 */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '😄', '🚀', '👀'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}
