import { useState, type FormEvent, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';
import {
  Button,
  DatePicker,
  Dialog,
  Input,
  RichTextEditor,
  Select,
} from '@/components/ui';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { TaskPanel } from '@/features/tasks/components/TaskPanel';
import {
  ROADMAP_DIFFICULTIES,
  ROADMAP_DIFFICULTY_COLOR,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUS_COLOR,
  ROADMAP_ITEM_STATUS_LABEL,
  ROADMAP_ITEM_STATUSES,
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@/types/enums';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';

interface RoadmapItemDialogProps {
  open: boolean;
  onClose: () => void;
  item?: RoadmapItem;
  defaultPhase?: string;
  onSave: (item: RoadmapItem) => void;
  /** Parent roadmap context — enables the Tasks panel when editing an item. */
  roadmapId?: string;
  projectId?: string;
  /** The roadmap's columns — drive the Phase picker + the item's column label. */
  columns?: RoadmapColumn[];
}

function emptyItem(phase: string): RoadmapItem {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    phase,
    status: RoadmapItemStatus.IDEA,
    difficulty: RoadmapDifficulty.MEDIUM,
    reach: 3,
    impact: 3,
    confidence: 3,
    effort: 3,
    progress: 0,
    rice: 0,
    imageUrl: '',
    startDate: '',
    assignees: [],
  };
}

/** RICE inputs, in order, with the field key + help copy. */
const RICE_FIELDS = [
  ['reach', 'roadmaps.reach', 'roadmaps.reachHelp'],
  ['impact', 'roadmaps.impact', 'roadmaps.impactHelp'],
  ['confidence', 'roadmaps.confidence', 'roadmaps.confidenceHelp'],
  ['effort', 'roadmaps.effort', 'roadmaps.effortHelp'],
] as const;

const SIDEBAR_LABEL = 'mb-1.5 block text-sm font-medium text-foreground';

/**
 * Option label with a leading colour dot. Radix renders the selected item's
 * text in the trigger too, so the dot shows in both the list and the closed
 * picker. The dot is decorative — the label carries the meaning.
 */
function DotLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function RoadmapItemDialog({
  open,
  onClose,
  item,
  defaultPhase,
  onSave,
  roadmapId,
  projectId,
  columns,
}: RoadmapItemDialogProps) {
  const { canManageDelivery, canEditDelivery: canWrite } = useAuth();
  // People list is admin/product-only; only fetch it for those who can assign.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const users = usersData?.items ?? [];

  const [form, setForm] = useState<RoadmapItem>(
    item ?? emptyItem(defaultPhase ?? columns?.[0]?.key ?? 'now'),
  );

  const set = (patch: Partial<RoadmapItem>) => setForm((f) => ({ ...f, ...patch }));
  const num = (v: string) => Number(v) || 0;
  // RICE factors are rated on a 1–5 scale.
  const clampRice = (v: string) => Math.min(5, Math.max(1, Number(v) || 1));

  // Live RICE score, shown with one decimal like the reference.
  const score = form.effort > 0 ? (form.reach * form.impact * form.confidence) / form.effort : 0;

  const assignedIds = new Set(form.assignees.map((a) => a.id));
  const addableUsers = users.filter((u) => !assignedIds.has(u.id));

  function addAssignee(id: string) {
    const u = users.find((x) => x.id === id);
    if (!u || assignedIds.has(id)) return;
    set({ assignees: [...form.assignees, { id: u.id, name: u.name }] });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, title: form.title.trim(), rice: Math.round(score) });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        // The heading *is* the item name — editable in place. It lives outside
        // the <form>, so `form="rm-item"` keeps it in submit + validation.
        <Input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t('roadmaps.itemTitlePlaceholder')}
          aria-label={t('roadmaps.itemTitle')}
          form="rm-item"
          required
          autoFocus
          className="-ml-2 h-9 border-transparent px-2 text-base font-semibold shadow-none transition-colors hover:border-input focus-visible:border-input"
        />
      }
      titleLabel={item ? t('roadmaps.editItem') : t('roadmaps.addItem')}
      fullscreenKey="roadmap-item"
      className="max-w-5xl"
      footer={
        <Button form="rm-item" type="submit">
          {t('roadmaps.done')}
        </Button>
      }
    >
      <form
        id="rm-item"
        onSubmit={submit}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        {/* ── Left: description (+ tasks) ─────────────────────────────────── */}
        <div className="flex min-w-0 flex-col">
          <label
            htmlFor="ri-desc"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t('roadmaps.description')}
          </label>
          <RichTextEditor
            value={form.description}
            onChange={(html) => set({ description: html })}
            placeholder={t('roadmaps.description')}
            minHeight={260}
            className="min-h-[300px] flex-1"
          />
          {item && roadmapId && (
            <TaskPanel
              roadmapId={roadmapId}
              projectId={projectId ?? ''}
              itemId={item.id}
              itemLabel={`${columns?.find((c) => c.key === item.phase)?.label ?? item.phase} · ${item.title}`}
            />
          )}
        </div>

        {/* ── Right: sidebar ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Status / Difficulty — the two fields triaged most often, so first. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={SIDEBAR_LABEL}>{t('roadmaps.status')}</span>
              <Select
                value={form.status}
                onValueChange={(v) => set({ status: v as RoadmapItemStatus })}
                options={ROADMAP_ITEM_STATUSES.map((s) => ({
                  value: s,
                  label: (
                    <DotLabel color={ROADMAP_ITEM_STATUS_COLOR[s]}>
                      {ROADMAP_ITEM_STATUS_LABEL[s]}
                    </DotLabel>
                  ),
                }))}
              />
            </div>
            <div>
              <span className={SIDEBAR_LABEL}>{t('roadmaps.difficulty')}</span>
              <Select
                value={form.difficulty}
                onValueChange={(v) => set({ difficulty: v as RoadmapDifficulty })}
                options={ROADMAP_DIFFICULTIES.map((d) => ({
                  value: d,
                  label: (
                    <DotLabel color={ROADMAP_DIFFICULTY_COLOR[d]}>
                      {ROADMAP_DIFFICULTY_LABEL[d]}
                    </DotLabel>
                  ),
                }))}
              />
            </div>
          </div>

          {/* Start date */}
          <div>
            <span className={SIDEBAR_LABEL}>{t('roadmaps.startDate')}</span>
            <DatePicker value={form.startDate} onChange={(v) => set({ startDate: v })} clearable />
          </div>

          {/* Assignees */}
          <div>
            <span className={SIDEBAR_LABEL}>{t('roadmaps.assignees')}</span>
            {form.assignees.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.assignees.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-0.5 pr-2 text-sm"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                    {a.name}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => set({ assignees: form.assignees.filter((x) => x.id !== a.id) })}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={t('common.delete')}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {canManageDelivery && addableUsers.length > 0 && (
              <Select
                value=""
                onValueChange={addAssignee}
                placeholder={t('roadmaps.addAssignee')}
                options={addableUsers.map((u) => ({ value: u.id, label: u.name }))}
              />
            )}
          </div>

          {/* RICE card */}
          <section className="rounded-xl border border-border p-3">
            <span className="inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('roadmaps.rice')}
            </span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {RICE_FIELDS.map(([key, labelKey, helpKey]) => (
                <div key={key}>
                  <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {t(labelKey)}
                    <HelpCircle className="size-3" aria-hidden />
                    <span className="sr-only">{t(helpKey)}</span>
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    step={key === 'impact' || key === 'effort' ? '0.5' : undefined}
                    value={form[key]}
                    onChange={(e) => set({ [key]: clampRice(e.target.value) } as Partial<RoadmapItem>)}
                    className="h-9"
                    title={t(helpKey)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">{t('roadmaps.score')}</span>
              <span className="font-mono text-base font-bold text-primary">{score.toFixed(1)}</span>
            </div>
          </section>

          {/* Progress */}
          <div>
            <span className={SIDEBAR_LABEL}>{t('roadmaps.progress')}</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => set({ progress: num(e.target.value) })}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label={t('roadmaps.progress')}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => set({ progress: num(e.target.value) })}
                className="h-9 w-16"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

        </div>
      </form>
    </Dialog>
  );
}
