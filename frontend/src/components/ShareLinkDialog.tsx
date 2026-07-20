import { useState } from 'react';
import { Button, Dialog, Label, Switch } from '@/components/ui';
import { t } from '@/i18n';

interface ShareLinkDialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog heading, e.g. "Share roadmap". */
  title: string;
  /** One-line description under the toggle. */
  hint: string;
  /** URL segment under `/public` — 'roadmaps' or 'teams'. */
  publicPath: string;
  enabled: boolean;
  publicToken: string | null;
  onToggle: (enabled: boolean) => void;
  pending?: boolean;
}

/**
 * Generic public read-only share dialog: a Switch that toggles the link, and the
 * link + copy button once it's on. Shared by roadmap boards and team boards
 * (projects keep their own `ShareProjectDialog`). The token is minted server-side
 * on enable, so the link appears after the toggle's mutation settles.
 */
export function ShareLinkDialog({
  open,
  onClose,
  title,
  hint,
  publicPath,
  enabled,
  publicToken,
  onToggle,
  pending,
}: ShareLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const link = publicToken
    ? `${window.location.origin}/public/${publicPath}/${publicToken}`
    : '';

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3">
        <Switch
          id="share-public"
          className="mt-0.5"
          checked={enabled}
          disabled={pending}
          onCheckedChange={onToggle}
        />
        <div className="grid gap-0.5">
          <Label htmlFor="share-public" className="cursor-pointer">
            {t('share.public')}
          </Label>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </div>
      </div>

      {enabled && link && (
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
