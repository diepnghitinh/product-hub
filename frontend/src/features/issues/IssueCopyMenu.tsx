import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, GitBranch, Hash, Link2 } from 'lucide-react';
import { Menu, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { issueBranchName, issueUrl } from './refs';

/** How long an item stays on "Copied!" before returning to its own label. */
const FLASH_MS = 1500;

interface IssueCopyMenuProps {
  /** Resolved uuid — the fallback address for an issue minted before refs. */
  issueId: string;
  shortId?: string;
  title: string;
  className?: string;
}

/**
 * The three things people copy out of an issue and paste somewhere else: its
 * URL (into chat), its ID (into a commit message or a standup note), and a git
 * branch name (into a terminal).
 *
 * One trigger rather than three buttons — icon-only buttons would be a guessing
 * game, and three labelled ones don't fit a phone. The menu is deliberately
 * ungated: copying an address is a read, so a viewer who can't edit the issue
 * still gets it.
 *
 * Items don't close the menu (`closeOnSelect` stays off), which is what makes
 * the confirmation possible — the row you just clicked flips to "Copied!" in
 * place, so you can see which of the three actually landed on the clipboard.
 */
export function IssueCopyMenu({ issueId, shortId, title, className }: IssueCopyMenuProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function copy(key: string, value: string) {
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), FLASH_MS);
  }

  const issue = { id: issueId, shortId, title };
  const row = (key: string, label: string, icon: ReactNode, value: string): MenuItem => ({
    label: copied === key ? t('common.copied') : label,
    icon: copied === key ? <Check className="size-4 text-primary" /> : icon,
    onClick: () => copy(key, value),
  });

  const items: MenuItem[] = [
    row('url', t('issues.copyUrl'), <Link2 className="size-4" />, issueUrl(issue)),
    row('id', t('issues.copyId'), <Hash className="size-4" />, shortId || issueId),
    row('branch', t('issues.copyBranch'), <GitBranch className="size-4" />, issueBranchName(issue)),
  ];

  return (
    <Menu
      align="right"
      triggerClassName={cn(
        'size-8 shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
        className,
      )}
      trigger={
        <>
          <Copy className="size-4" aria-hidden />
          <span className="sr-only">{t('issues.copyMenu')}</span>
        </>
      }
      items={items}
    />
  );
}
