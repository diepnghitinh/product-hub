import { MoreHorizontal } from 'lucide-react';
import { Input, Menu, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { SECTION_TYPE_COLOR, SectionType } from '@/types/enums';
import type { ReportSection } from '@/types/dto';

interface SectionBlockProps {
  section: Exclude<ReportSection, { type: SectionType.TESTING }>;
  canWrite: boolean;
  onChange: (updated: ReportSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const linesToArray = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);
const arrayToLines = (a: string[]) => (a ?? []).join('\n');

/** Renders + edits a narrative section (all types except testing). */
export function SectionBlock({
  section,
  canWrite,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: SectionBlockProps) {
  function patch(fields: Partial<ReportSection>) {
    onChange({ ...section, ...fields } as ReportSection);
  }

  return (
    <section
      className="rounded-xl border border-l-4 bg-card p-4 shadow-sm sm:p-5"
      style={{ borderLeftColor: SECTION_TYPE_COLOR[section.type] }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {canWrite ? (
            <Input
              className="max-w-[400px] border-transparent bg-transparent text-[15px] font-semibold shadow-none hover:border-input"
              defaultValue={section.title}
              placeholder={t('report.sectionTitle')}
              onBlur={(e) => e.target.value !== section.title && patch({ title: e.target.value })}
            />
          ) : (
            <h3 className="text-[15px] font-semibold">{section.title}</h3>
          )}
        </div>
        {canWrite && (
          <Menu
            trigger={
              <button
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Section menu"
              >
                <MoreHorizontal className="size-4" />
              </button>
            }
            items={[
              { label: t('groups.moveUp'), onClick: onMoveUp },
              { label: t('groups.moveDown'), onClick: onMoveDown },
              { label: t('report.deleteSection'), onClick: onDelete, danger: true },
            ]}
          />
        )}
      </div>

      <SectionBody section={section} canWrite={canWrite} patch={patch} />
    </section>
  );
}

function SectionBody({
  section,
  canWrite,
  patch,
}: {
  section: Exclude<ReportSection, { type: SectionType.TESTING }>;
  canWrite: boolean;
  patch: (fields: Partial<ReportSection>) => void;
}) {
  switch (section.type) {
    case SectionType.OVERVIEW:
      return canWrite ? (
        <Textarea
          defaultValue={arrayToLines(section.paragraphs)}
          placeholder={t('report.oneLinePerPara')}
          onBlur={(e) => patch({ paragraphs: linesToArray(e.target.value) })}
        />
      ) : (
        <div className="space-y-3 text-sm leading-relaxed text-foreground">
          {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      );

    case SectionType.BULLETS:
    case SectionType.ORDERED: {
      const ListTag = section.type === SectionType.ORDERED ? 'ol' : 'ul';
      const listStyle = section.type === SectionType.ORDERED ? 'list-decimal' : 'list-disc';
      return canWrite ? (
        <Textarea
          defaultValue={arrayToLines(section.items)}
          placeholder={t('report.oneLinePerItem')}
          onBlur={(e) => patch({ items: linesToArray(e.target.value) })}
        />
      ) : (
        <ListTag className={cn('space-y-1 pl-6 text-sm text-foreground', listStyle)}>
          {section.items?.map((it, i) => <li key={i}>{it}</li>)}
        </ListTag>
      );
    }

    case SectionType.CARDS:
      return (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {(section.cards ?? []).map((c, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm"
            >
              <strong className="font-medium">{c.name}</strong>
              <span className="text-muted-foreground">{c.desc}</span>
            </div>
          ))}
          {canWrite && (
            <button
              className="flex items-center justify-center rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              onClick={() =>
                patch({ cards: [...(section.cards ?? []), { name: 'New', desc: '' }] })
              }
            >
              + card
            </button>
          )}
        </div>
      );

    case SectionType.STEPS:
      return (
        <ol className="list-decimal space-y-1.5 pl-6 text-sm text-foreground">
          {(section.steps ?? []).map((s, i) => (
            <li key={i}>
              <strong className="font-medium">{s.name}</strong>
              {s.desc && <span className="text-muted-foreground">: {s.desc}</span>}
            </li>
          ))}
          {canWrite && (
            <button
              className="mt-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() =>
                patch({
                  steps: [
                    ...(section.steps ?? []),
                    { num: (section.steps?.length ?? 0) + 1, name: 'New step', desc: '' },
                  ],
                })
              }
            >
              + step
            </button>
          )}
        </ol>
      );

    case SectionType.SCREENSHOT:
      return (
        <div className="flex flex-wrap gap-3">
          {(section.images ?? []).map((img, i) => (
            <figure key={i} className="flex flex-col gap-1">
              {img.src ? (
                <img src={img.src} alt={img.alt ?? ''} className="max-w-[220px] rounded-md border" />
              ) : (
                <div className="grid h-[90px] w-[160px] place-items-center rounded-md border border-dashed text-sm text-muted-foreground">
                  image
                </div>
              )}
              {img.caption && (
                <figcaption className="text-xs text-muted-foreground">{img.caption}</figcaption>
              )}
            </figure>
          ))}
          {canWrite && (
            <button
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() =>
                patch({ images: [...(section.images ?? []), { src: '', caption: '' }] })
              }
            >
              + image URL
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
}
