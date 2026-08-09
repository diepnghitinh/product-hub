import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ColorSelect,
  Input,
  SaveButton,
} from '@/components/ui';
import { RowsSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { deepEqual } from '@/lib/utils';
import { ROADMAP_COLUMN_PALETTE } from '@/types/enums';
import type { RoadmapColumn, RoadmapColumnTemplate } from '@/types/dto';
import {
  useReplaceRoadmapTemplates,
  useRoadmaps,
  useRoadmapTemplates,
} from '@/features/roadmaps/api';

/** The one template the server always keeps — it's every roadmap's fallback. */
const BUILTIN_ID = 'builtin-default';

/**
 * Roadmap column templates — the *global* half of how backlog boards are laid
 * out. A roadmap either points at one of these (live: edit it here and every
 * board on it moves) or keeps columns of its own, chosen per board in
 * `⋯ → Manage columns`.
 *
 * Not admin-only: this is delivery config, the same call as a team's statuses,
 * and the backend agrees (`PUT /roadmap-templates` is `@Roles(ADMIN, PRODUCT)`).
 *
 * Everything edits into one draft and saves in one write, because the list is
 * replaced whole — a per-template save button would suggest they're independent
 * documents, and a half-saved list is exactly the state that strands a link.
 */
export function RoadmapColumnsSection() {
  const { data: saved } = useRoadmapTemplates();
  const { data: roadmaps } = useRoadmaps();
  const replace = useReplaceRoadmapTemplates();
  const [draft, setDraft] = useState<RoadmapColumnTemplate[]>([]);
  const loading = saved === undefined;
  const dirty = !deepEqual(draft, saved ?? []);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  /** How many boards this template is currently painting — what makes an edit
   *  here feel as wide as it is. */
  const usedBy = (id: string) =>
    (roadmaps ?? []).filter((r) => r.columnTemplateId === id).length;

  const patch = (id: string, next: Partial<RoadmapColumnTemplate>) =>
    setDraft((list) => list.map((tpl) => (tpl.id === id ? { ...tpl, ...next } : tpl)));

  function addTemplate() {
    const id = `tpl-${crypto.randomUUID().slice(0, 8)}`;
    setDraft((list) => [
      ...list,
      {
        id,
        name: t('settings.roadmapTemplateNew'),
        // A new template starts from the built-in rather than empty: a set of
        // columns is what it *is*, and a blank one can't be saved.
        columns: (list.find((tpl) => tpl.id === BUILTIN_ID) ?? list[0])?.columns ?? [],
        isDefault: false,
      },
    ]);
  }

  /** Exactly one default — it decides where a new roadmap starts. */
  function makeDefault(id: string) {
    setDraft((list) => list.map((tpl) => ({ ...tpl, isDefault: tpl.id === id })));
  }

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>{t('settings.roadmapColumns')}</CardTitle>
        <CardDescription>{t('settings.roadmapColumnsHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <RowsSkeleton rows={3} />
        ) : (
          draft.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              usedBy={usedBy(tpl.id)}
              builtin={tpl.id === BUILTIN_ID}
              onChange={(next) => patch(tpl.id, next)}
              onMakeDefault={() => makeDefault(tpl.id)}
              onRemove={() => setDraft((list) => list.filter((x) => x.id !== tpl.id))}
            />
          ))
        )}
        {!loading && (
          <Button variant="ghost" size="sm" onClick={addTemplate}>
            <Plus className="mr-1.5 size-3.5" />
            {t('settings.roadmapTemplateAdd')}
          </Button>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <SaveButton
          onSave={() => replace.mutateAsync(draft)}
          disabled={
            !dirty ||
            draft.length === 0 ||
            draft.some((tpl) => !tpl.name.trim() || tpl.columns.every((c) => !c.label.trim()))
          }
        >
          {t('common.save')}
        </SaveButton>
      </CardFooter>
    </Card>
  );
}

/** One template: its name, whether new roadmaps start on it, and its columns. */
function TemplateCard({
  template,
  usedBy,
  builtin,
  onChange,
  onMakeDefault,
  onRemove,
}: {
  template: RoadmapColumnTemplate;
  usedBy: number;
  builtin: boolean;
  onChange: (next: Partial<RoadmapColumnTemplate>) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  const setColumns = (columns: RoadmapColumn[]) => onChange({ columns });

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= template.columns.length) return;
    const copy = [...template.columns];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setColumns(copy);
  }

  function addColumn() {
    const used = new Set(template.columns.map((c) => c.color));
    const color =
      ROADMAP_COLUMN_PALETTE.find((p) => !used.has(p.value))?.value ??
      ROADMAP_COLUMN_PALETTE[0].value;
    setColumns([
      ...template.columns,
      { key: `col-${crypto.randomUUID().slice(0, 8)}`, label: t('roadmaps.newColumn'), color },
    ]);
  }

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:gap-3 sm:px-4">
        {/* Full width on a phone: sharing the row with the badges squeezed the
            name down to a couple of characters. */}
        <Input
          className="w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1"
          value={template.name}
          placeholder={t('settings.roadmapTemplateName')}
          aria-label={t('settings.roadmapTemplateName')}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {template.isDefault ? (
          <Badge variant="secondary">{t('settings.roadmapTemplateDefault')}</Badge>
        ) : (
          <Button variant="ghost" size="sm" onClick={onMakeDefault}>
            {t('settings.roadmapTemplateMakeDefault')}
          </Button>
        )}
        {builtin ? (
          <Badge variant="outline">{t('settings.builtIn')}</Badge>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={t('common.delete')}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <span className="w-full text-xs text-muted-foreground sm:w-auto">
          {usedBy === 1
            ? t('settings.roadmapTemplateUsedOne')
            : t('settings.roadmapTemplateUsed').replace('{count}', String(usedBy))}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3 sm:px-4">
        {template.columns.map((col, i) => (
          <div key={col.key} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                aria-label={t('settings.moveUp')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                aria-label={t('settings.moveDown')}
                disabled={i === template.columns.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-3.5" />
              </button>
            </div>
            <div className="w-28 shrink-0">
              <ColorSelect
                value={col.color}
                options={ROADMAP_COLUMN_PALETTE}
                onChange={(color) =>
                  setColumns(template.columns.map((c, x) => (x === i ? { ...c, color } : c)))
                }
                ariaLabel={t('roadmaps.columnColor')}
              />
            </div>
            <Input
              className="min-w-0 flex-1"
              value={col.label}
              placeholder={t('roadmaps.columnName')}
              onChange={(e) =>
                setColumns(
                  template.columns.map((c, x) => (x === i ? { ...c, label: e.target.value } : c)),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={t('common.delete')}
              disabled={template.columns.length <= 1}
              onClick={() => setColumns(template.columns.filter((_, x) => x !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button variant="ghost" size="sm" onClick={addColumn}>
            <Plus className="mr-1.5 size-3.5" />
            {t('roadmaps.addColumn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
