import { useState, type ReactNode } from 'react';
import {
  AlignJustify,
  Clock,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Smile,
} from 'lucide-react';
import { Button, Drawer, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { DocFontSize, DocFontStyle, DocPageWidth } from '@/types/enums';
import type { DocPageStyle } from '../pageStyle';

interface DocPageStylesProps {
  open: boolean;
  onClose: () => void;
  style: DocPageStyle;
  /** A patch of whatever the reader just changed — never the whole object. */
  onChange: (patch: Partial<DocPageStyle>) => void;
  /**
   * Push this page's font, size and width onto every other page of the doc.
   * Omit on a doc with only one page — there's nothing to apply it to.
   */
  onApplyToAll?: () => Promise<void>;
}

/**
 * Page Styles — how one page is set, and which parts of its header show.
 *
 * A slide-over rather than a dialog, and every control writes immediately: this
 * is a panel you keep open while looking at the page behind it, so each change
 * has to be visible the moment it's made. There is no Save and no Cancel — the
 * page is the preview, and a wrong turn is one more click back.
 *
 * Scope is one page. That's why "apply typography to all pages" exists and is a
 * deliberate second action: the font of *this* page is a small decision, the
 * font of the whole doc is not.
 */
export function DocPageStyles({
  open,
  onClose,
  style,
  onChange,
  onApplyToAll,
}: DocPageStylesProps) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  async function applyAll() {
    if (!onApplyToAll) return;
    setApplying(true);
    try {
      await onApplyToAll();
      setApplied(true);
      // Long enough to read, short enough that it doesn't look like state.
      setTimeout(() => setApplied(false), 3000);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('docs.pageStyles')}
      widthClassName="sm:max-w-sm"
      headerActions={<span className="px-1 text-sm font-medium">{t('docs.pageStyles')}</span>}
    >
      <div className="space-y-6">
        <Group label={t('docs.fontStyle')}>
          <Choices
            value={style.fontStyle}
            onChange={(fontStyle) => onChange({ fontStyle })}
            options={[
              {
                value: DocFontStyle.SYSTEM,
                label: t('docs.fontSystem'),
                // Each option is drawn in the face it turns on — the specimen
                // says more than the word does.
                sample: <span className="font-sans text-base">Aa</span>,
              },
              {
                value: DocFontStyle.SERIF,
                label: t('docs.fontSerif'),
                sample: <span className="font-serif text-base">Ss</span>,
              },
              {
                value: DocFontStyle.MONO,
                label: t('docs.fontMono'),
                sample: <span className="font-mono text-base">00</span>,
              },
            ]}
          />
        </Group>

        <Group label={t('docs.fontSize')}>
          <Choices
            value={style.fontSize}
            onChange={(fontSize) => onChange({ fontSize })}
            options={[
              {
                value: DocFontSize.SMALL,
                label: t('docs.sizeSmall'),
                sample: <SizeSample scale="text-xs" />,
              },
              {
                value: DocFontSize.DEFAULT,
                label: t('docs.sizeDefault'),
                sample: <SizeSample scale="text-sm" />,
              },
              {
                value: DocFontSize.LARGE,
                label: t('docs.sizeLarge'),
                sample: <SizeSample scale="text-base" />,
              },
            ]}
          />
        </Group>

        <Group label={t('docs.pageWidth')}>
          <Choices
            value={style.pageWidth}
            onChange={(pageWidth) => onChange({ pageWidth })}
            options={[
              { value: DocPageWidth.DEFAULT, label: t('docs.widthDefault') },
              { value: DocPageWidth.FULL, label: t('docs.widthFull') },
            ]}
          />
        </Group>

        {onApplyToAll && (
          <div className="border-b pb-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              loading={applying}
              disabled={applying}
              onClick={() => void applyAll()}
            >
              {applied ? t('docs.applyToAllDone') : t('docs.applyToAll')}
            </Button>
          </div>
        )}

        <Group label={t('docs.headerSection')}>
          <div className="-mx-1">
            <Toggle
              icon={<ImageIcon className="size-4" />}
              label={t('docs.showCover')}
              checked={style.showCover}
              onChange={(showCover) => onChange({ showCover })}
            />
            <Toggle
              icon={<Smile className="size-4" />}
              label={t('docs.showTitle')}
              // Hiding the heading doesn't strand the title: it stays editable
              // in the page rail, which is where renaming already happens.
              hint={t('docs.showTitleHint')}
              checked={style.showTitle}
              onChange={(showTitle) => onChange({ showTitle })}
            />
            <Toggle
              icon={<Clock className="size-4" />}
              label={t('docs.showUpdated')}
              checked={style.showUpdated}
              onChange={(showUpdated) => onChange({ showUpdated })}
            />
          </div>
        </Group>

        <Group label={t('docs.sectionsSection')}>
          <div className="-mx-1">
            <Toggle
              icon={<Link2 className="size-4" />}
              label={t('docs.showLinks')}
              checked={style.showLinks}
              onChange={(showLinks) => onChange({ showLinks })}
            />
            <Toggle
              icon={<Paperclip className="size-4" />}
              label={t('docs.showAttachments')}
              checked={style.showAttachments}
              onChange={(showAttachments) => onChange({ showAttachments })}
            />
          </div>
        </Group>
      </div>
    </Drawer>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
  /** Optional specimen shown above the label. */
  sample?: ReactNode;
}

/**
 * A segmented picker: every option visible at once, each one a preview of what
 * it does. A `<Select>` would hide the choices behind a click and lose the
 * specimen, which is the whole point here.
 */
function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Choice<T>[];
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-3 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted',
            )}
          >
            {option.sample}
            <span className={cn('leading-none', active && 'font-medium')}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Three stacked rules, sized to stand for a paragraph at that size. */
function SizeSample({ scale }: { scale: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('font-medium', scale)}>Aa</span>
      <AlignJustify className={cn('opacity-60', scale)} aria-hidden />
    </span>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-muted/50">
      <span className="shrink-0 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
