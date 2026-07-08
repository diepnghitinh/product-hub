import { useState } from 'react';
import { Button, Dialog, Label, Switch } from '@/components/ui';
import { t } from '@/i18n';
import type { ProjectDto } from '@/types/dto';
import { useSetProjectSharing } from '../api';

interface ShareProjectDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectDto;
}

export function ShareProjectDialog({ open, onClose, project }: ShareProjectDialogProps) {
  const setSharing = useSetProjectSharing();
  const [copied, setCopied] = useState(false);

  const link = project.publicToken
    ? `${window.location.origin}/public/projects/${project.publicToken}`
    : '';

  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <div className="flex items-start gap-3">
        <Switch
          id="share-public"
          className="mt-0.5"
          checked={project.publicEnabled}
          onCheckedChange={(checked) =>
            setSharing.mutate({ id: project.id, enabled: checked })
          }
        />
        <div className="grid gap-0.5">
          <Label htmlFor="share-public" className="cursor-pointer">
            {t('share.public')}
          </Label>
          <span className="text-sm text-muted-foreground">{t('share.publicHint')}</span>
        </div>
      </div>

      {project.publicEnabled && link && (
        <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{link}</code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? t('share.linkCopied') : t('share.copyLink')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
