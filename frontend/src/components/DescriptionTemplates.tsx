import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Menu } from '@/components/ui';
import { t } from '@/i18n';
import type { I18nKey } from '@/i18n/en';

/**
 * A starter structure for a description — a backlog item's user story, a bug's
 * repro steps. `buildHtml` returns plain HTML using only blocks the editor
 * round-trips (headings, paragraphs, lists, bold); see `lib/editorjs`.
 *
 * Applying one fills an empty description so the writer starts from a proven
 * shape instead of a blank page. Each feature owns its own list
 * (`roadmaps/backlogTemplates`, `bugs/bugTemplates`) — this file owns how they
 * are offered, so every editor presents templates the same way.
 */
export interface DescriptionTemplate {
  id: string;
  labelKey: I18nKey;
  hintKey: I18nKey;
  buildHtml: () => string;
}

/** Does this description hold anything worth guarding before we replace it?
 *  An image or video counts even though it strips to no text. */
export function htmlHasContent(html: string): boolean {
  return /<(img|video)/i.test(html) || html.replace(/<[^>]*>/g, '').trim().length > 0;
}

/**
 * Template state for one description editor.
 *
 * `RichTextEditor` (Editor.js) reads `value` only at mount, so applying a
 * template can't just save and hope — the editor has to be remounted with the
 * new HTML. That's what `nonce` is for: put it in the editor's `key` and pass
 * `value`, and the template shows the moment it's applied, regardless of when
 * the save round-trips.
 *
 * @param description what's stored (the editor's value between templates)
 * @param onApply     persist the chosen template's HTML — called immediately,
 *                    ahead of any debounce, because the user asked for it
 * @param resetKey    the subject being edited; a new one clears the seed, so a
 *                    page reused in place (the roadmap item route) doesn't carry
 *                    the last item's template over to the next
 */
export function useTemplateSeed(
  description: string,
  onApply: (html: string) => void,
  resetKey?: string,
) {
  const [seed, setSeed] = useState<{ nonce: number; html: string | null }>({
    nonce: 0,
    html: null,
  });
  useEffect(() => setSeed({ nonce: 0, html: null }), [resetKey]);

  const value = seed.html ?? description;
  const hasContent = htmlHasContent(value);

  return {
    /** Bump the editor's `key` with this: `key={`${id}:${nonce}`}`. */
    nonce: seed.nonce,
    /** What the editor should render (the seed wins right after an apply). */
    value,
    hasContent,
    apply: (tpl: DescriptionTemplate) => {
      // Replacing written work is destructive and not undoable here, so confirm.
      if (hasContent && !confirm(t('templates.replaceConfirm'))) return;
      const html = tpl.buildHtml();
      setSeed((s) => ({ nonce: s.nonce + 1, html }));
      onApply(html);
    },
  };
}

/**
 * The template picker above a description editor. Two faces, one decision made
 * here so no page has to make it: an **empty** description gets the prompting
 * panel (the templates are the point of the empty state); one with content gets
 * a quiet right-aligned menu, since replacing what's there is the rare case.
 */
export function DescriptionTemplates({
  templates,
  hasContent,
  onApply,
}: {
  templates: DescriptionTemplate[];
  hasContent: boolean;
  onApply: (tpl: DescriptionTemplate) => void;
}) {
  if (!templates.length) return null;

  if (hasContent) {
    return (
      <div className="mb-2 flex justify-end">
        <Menu
          align="right"
          triggerClassName="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          trigger={
            <>
              <FileText className="size-3.5" aria-hidden />
              {t('templates.title')}
            </>
          }
          items={templates.map((tpl) => ({
            label: t(tpl.labelKey),
            icon: <FileText className="size-4" />,
            closeOnSelect: true,
            onClick: () => onApply(tpl),
          }))}
        />
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
      <span className="mr-1 text-xs font-medium text-muted-foreground">{t('templates.start')}</span>
      {templates.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onApply(tpl)}
          title={t(tpl.hintKey)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <FileText className="size-3.5 text-primary" aria-hidden />
          {t(tpl.labelKey)}
        </button>
      ))}
    </div>
  );
}
