/**
 * Who is in this page right now, and whether we are actually connected.
 *
 * Sits in the page's meta row beside "edited 5 minutes ago", because that is the
 * same question — who has touched this — asked about the present tense.
 */
import { Loader2, WifiOff } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import type { CollabPeer, CollabStatus } from './useCollabSession';

/** Faces beyond this collapse into a +n disc; a row of 12 tells you nothing. */
const MAX_FACES = 4;

export function CollabPresence({
  peers,
  status,
  className,
}: {
  peers: CollabPeer[];
  status: CollabStatus;
  className?: string;
}) {
  if (status === 'denied') return null;

  if (status !== 'connected') {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        {status === 'connecting' ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t('docs.collab.connecting')}
          </>
        ) : (
          <>
            <WifiOff className="size-3" aria-hidden />
            {t('docs.collab.offline')}
          </>
        )}
      </span>
    );
  }

  // Connected and alone is the normal case and needs no ornament — a row of one
  // avatar showing yourself would be noise on every page you open.
  if (peers.length === 0) return null;

  const shown = peers.slice(0, MAX_FACES);
  const extra = peers.length - shown.length;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {/* Overlapped, so the row's width grows slowly as people arrive. */}
      <span className="flex items-center">
        {shown.map((peer) => (
          <Tooltip key={peer.clientId}>
            <TooltipTrigger asChild>
              {/* The ring is the person's own colour — the same colour their
                  caret is drawn in, so a cursor in the text and a face up here
                  are visibly the same collaborator. */}
              <span
                className="-ml-1.5 rounded-full ring-2 first:ml-0"
                style={{ ['--tw-ring-color' as string]: peer.color }}
              >
                <UserAvatar
                  name={peer.name}
                  src={peer.avatarUrl}
                  seed={peer.userId}
                  tint
                  className="size-5 border-2 border-background"
                  fallbackClassName="text-[9px]"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{peer.name}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <span className="-ml-1.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold text-muted-foreground">
            +{extra}
          </span>
        )}
      </span>
      <span className="max-sm:hidden">{t('docs.collab.editing')}</span>
    </span>
  );
}

/**
 * "Live" — the replacement for the save indicator.
 *
 * The old editor answered "is my work safe?" with a Saving…/Saved tick. A CRDT
 * has nothing to report: the body is stored the instant it's typed, so that
 * indicator would sit silent forever and a writer would be left guessing. This
 * says the quiet part out loud, once, and the tooltip explains why there is no
 * button. Deliberately shown even when you're alone on the page — that is
 * exactly when the reassurance is worth most.
 */
export function CollabLive({ status }: { status: CollabStatus }) {
  if (status !== 'connected') return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* text-success, the same green the Saved tick used, so "your work is
            safe" keeps one colour across both editors. */}
        <span className="inline-flex cursor-default items-center gap-1 text-success">
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {t('docs.collab.live')}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t('docs.collab.liveHint')}</TooltipContent>
    </Tooltip>
  );
}
