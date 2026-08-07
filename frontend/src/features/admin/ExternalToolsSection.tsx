import { Blocks } from 'lucide-react';
import { t } from '@/i18n';
import { ClickUpTool } from './ClickUpTool';

/**
 * Settings → External tools.
 *
 * The category, not the tool. An "external tool" here means one thing precisely:
 * a product outside Product OS whose work a record can *point at*. Link a task
 * there to an issue or a backlog item and its status is mirrored beside your
 * own — one way, read only, never written back, never allowed to move a status
 * on this board.
 *
 * That definition is why Integrations (git) stays a separate tab rather than
 * moving in here. A repository doesn't have work you link a record to; it pushes
 * pipeline state at us and stores no credential. Same word, different shape —
 * filing them together would make the promise above untrue of half the page.
 *
 * The section owns the heading and the promise; each tool below owns its own
 * `h3`, state badge and configuration. Adding the second tool is one import and
 * one line — which is the entire point of the tab existing before there are two.
 */
export function ExternalToolsSection() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('settings.externalTools')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.externalToolsHint')}</p>
      </div>

      <ClickUpTool />

      {/* Deliberately not a disabled "+ Add tool" button: a control that can
          never be clicked is a dead end wearing an affordance. This says the same
          thing and asks for the one piece of information we actually want back. */}
      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
        <Blocks className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">{t('settings.externalToolsMore')}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('settings.externalToolsMoreHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
