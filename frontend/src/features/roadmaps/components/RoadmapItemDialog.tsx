import { useState, type FormEvent } from 'react';
import { HelpCircle, X } from 'lucide-react';
import {
  Button,
  DatePicker,
  Dialog,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { TaskPanel } from '@/features/tasks/components/TaskPanel';
import {
  ROADMAP_DIFFICULTIES,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUS_LABEL,
  ROADMAP_ITEM_STATUSES,
  ROADMAP_PHASE_LABEL,
  ROADMAP_PHASES,
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
} from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';

interface RoadmapItemDialogProps {
  open: boolean;
  onClose: () => void;
  item?: RoadmapItem;
  defaultPhase?: RoadmapPhase;
  onSave: (item: RoadmapItem) => void;
  /** Parent roadmap context — enables the Tasks panel when editing an item. */
  roadmapId?: string;
  projectId?: string;
}

function emptyItem(phase: RoadmapPhase): RoadmapItem {
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

export function RoadmapItemDialog({
  open,
  onClose,
  item,
  defaultPhase,
  onSave,
  roadmapId,
  projectId,
}: RoadmapItemDialogProps) {
  const { canManageDelivery, canEditDelivery: canWrite } = useAuth();
  // People list is admin/product-only; only fetch it for those who can assign.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const users = usersData?.items ?? [];

  const [form, setForm] = useState<RoadmapItem>(item ?? emptyItem(defaultPhase ?? RoadmapPhase.NOW));

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
      title={item ? t('roadmaps.editItem') : t('roadmaps.addItem')}
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
        {/* ── Left: title + description (+ tasks) ─────────────────────────── */}
        <div className="flex min-w-0 flex-col">
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={t('roadmaps.itemTitle')}
            className="h-11 text-base font-medium"
            required
            autoFocus
          />
          <label
            htmlFor="ri-desc"
            className="mb-1.5 mt-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t('roadmaps.description')}
          </label>
          <Textarea
            id="ri-desc"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            className="min-h-[300px] flex-1 resize-y leading-relaxed"
          />
          {item && roadmapId && (
            <TaskPanel
              roadmapId={roadmapId}
              projectId={projectId ?? ''}
              itemId={item.id}
              itemLabel={`${ROADMAP_PHASE_LABEL[item.phase]} · ${item.title}`}
            />
          )}
        </div>

        {/* ── Right: sidebar ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
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

          {/* Phase / Status / Difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <span className={SIDEBAR_LABEL}>{t('roadmaps.phase')}</span>
              <Select
                value={form.phase}
                onValueChange={(v) => set({ phase: v as RoadmapPhase })}
                options={ROADMAP_PHASES.map((p) => ({ value: p, label: ROADMAP_PHASE_LABEL[p] }))}
              />
            </div>
            <div>
              <span className={SIDEBAR_LABEL}>{t('roadmaps.status')}</span>
              <Select
                value={form.status}
                onValueChange={(v) => set({ status: v as RoadmapItemStatus })}
                options={ROADMAP_ITEM_STATUSES.map((s) => ({ value: s, label: ROADMAP_ITEM_STATUS_LABEL[s] }))}
              />
            </div>
            <div>
              <span className={SIDEBAR_LABEL}>{t('roadmaps.difficulty')}</span>
              <Select
                value={form.difficulty}
                onValueChange={(v) => set({ difficulty: v as RoadmapDifficulty })}
                options={ROADMAP_DIFFICULTIES.map((d) => ({ value: d, label: ROADMAP_DIFFICULTY_LABEL[d] }))}
              />
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
