import { ReactionEntity } from '../domain/entities/reaction.entity';
import { REACTION_EMOJIS } from '../domain/reaction-emoji';
import { ReactionGroupResponseDto } from '../dtos/reaction-group.response.dto';

export class ReactionMapper {
  /**
   * Fold a target's flat reactions into per-emoji tallies for the current user.
   * Only emojis with at least one reaction are returned, in the fixed palette
   * order so the bar's layout is stable as counts change.
   */
  static toGroups(reactions: ReactionEntity[], currentUserId: string): ReactionGroupResponseDto[] {
    const byEmoji = new Map<string, ReactionEntity[]>();
    for (const r of reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r);
      byEmoji.set(r.emoji, list);
    }
    return REACTION_EMOJIS.filter((e) => byEmoji.has(e)).map((emoji) => {
      const list = byEmoji.get(emoji)!;
      return {
        emoji,
        count: list.length,
        reactedByMe: list.some((r) => r.userId === currentUserId),
        userNames: list.map((r) => r.userName).filter(Boolean),
      };
    });
  }
}
