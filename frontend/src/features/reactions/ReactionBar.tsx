import { SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { REACTION_EMOJIS, ReactionTargetType } from '@/types/enums';
import { useReactions, useToggleReaction } from './api';

interface ReactionBarProps {
  targetType: ReactionTargetType;
  targetId: string;
  className?: string;
}

/**
 * Social-style quick reactions for an entity — sits under the Description on bug,
 * task and roadmap-item detail. Shows a pill per emoji that has reactions (count +
 * who, on hover), brand-tinted when you've reacted, plus a "+" that opens the
 * fixed palette. Optimistic via `useToggleReaction`.
 */
export function ReactionBar({ targetType, targetId, className }: ReactionBarProps) {
  const { data: groups } = useReactions(targetType, targetId);
  const toggle = useToggleReaction(targetType, targetId);
  const list = groups ?? [];

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {list.map((g) => {
        // count can exceed named reactors (a reactor with no display name is
        // dropped server-side), so fold the overflow — and any names past the
        // cap — into a single "+N more" line.
        const shown = g.userNames.slice(0, 10);
        const more = g.count - shown.length;
        return (
          <Tooltip key={g.emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toggle.mutate(g.emoji)}
                aria-pressed={g.reactedByMe}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition-colors',
                  g.reactedByMe
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                )}
              >
                <span className="text-sm leading-none">{g.emoji}</span>
                <span className="tabular-nums">{g.count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[13rem]">
              <div className="flex flex-col gap-0.5 text-left">
                {shown.map((name, i) => (
                  <span key={i}>{name}</span>
                ))}
                {more > 0 && (
                  <span className="opacity-80">
                    +{more} {t('reactions.more')}
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={t('reactions.add')}
            aria-label={t('reactions.add')}
            className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
          >
            <SmilePlus className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="flex w-auto gap-1 p-1">
          {REACTION_EMOJIS.map((emoji) => {
            const mine = list.find((g) => g.emoji === emoji)?.reactedByMe;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => toggle.mutate(emoji)}
                aria-pressed={!!mine}
                className={cn(
                  'grid size-8 place-items-center rounded-md text-lg leading-none transition-transform hover:scale-110 hover:bg-accent',
                  mine && 'bg-primary/10',
                )}
              >
                {emoji}
              </button>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
