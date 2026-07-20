import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Menu } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/i18n';
import type { TeamDto } from '@/types/dto';
import { ShareLinkDialog } from '@/components/ShareLinkDialog';
import { useSetTeamSharing } from './api';

/** The ⋯ menu on a team board — currently just "Share". Admin/product only,
 * mirroring the roadmap board's share gate; renders nothing for everyone else. */
export function TeamShareMenu({ team }: { team: TeamDto }) {
  const { canManageDelivery } = useAuth();
  const [open, setOpen] = useState(false);
  const setSharing = useSetTeamSharing();

  if (!canManageDelivery) return null;

  return (
    <>
      <Menu
        align="right"
        triggerClassName="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        trigger={
          <>
            <MoreHorizontal className="size-4" aria-hidden />
            <span className="sr-only">{t('common.more')}</span>
          </>
        }
        items={[{ label: t('share.share'), onClick: () => setOpen(true) }]}
      />
      {open && (
        <ShareLinkDialog
          open={open}
          onClose={() => setOpen(false)}
          title={t('share.titleBoard')}
          hint={t('share.boardHint')}
          publicPath="teams"
          enabled={team.publicEnabled}
          publicToken={team.publicToken}
          pending={setSharing.isPending}
          onToggle={(enabled) => setSharing.mutate({ id: team.id, enabled })}
        />
      )}
    </>
  );
}
