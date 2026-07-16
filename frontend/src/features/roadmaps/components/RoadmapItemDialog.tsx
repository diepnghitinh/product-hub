import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { t } from '@/i18n';
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

export function RoadmapItemDialog({
  open,
  onClose,
  item,
  defaultPhase,
  onSave,
  roadmapId,
  projectId,
}: RoadmapItemDialogProps) {
  const [form, setForm] = useState<RoadmapItem>(
    item ?? {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      phase: defaultPhase ?? RoadmapPhase.NOW,
      status: RoadmapItemStatus.IDEA,
      difficulty: RoadmapDifficulty.MEDIUM,
      reach: 100,
      impact: 2,
      confidence: 80,
      effort: 2,
      progress: 0,
      rice: 0,
    },
  );

  const set = (patch: Partial<RoadmapItem>) => setForm((f) => ({ ...f, ...patch }));
  const num = (v: string) => Number(v) || 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, title: form.title.trim() });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? t('roadmaps.editItem') : t('roadmaps.addItem')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="rm-item" type="submit">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="rm-item" onSubmit={submit}>
        <Field label={t('roadmaps.itemTitle')} htmlFor="ri-title">
          <Input id="ri-title" value={form.title} onChange={(e) => set({ title: e.target.value })} required autoFocus />
        </Field>
        <div className="mb-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 [&>div]:mb-0">
          <Field label="Phase">
            <Select
              value={form.phase}
              onValueChange={(v) => set({ phase: v as RoadmapPhase })}
              options={ROADMAP_PHASES.map((p) => ({ value: p, label: ROADMAP_PHASE_LABEL[p] }))}
            />
          </Field>
          <Field label={t('roadmaps.status')}>
            <Select
              value={form.status}
              onValueChange={(v) => set({ status: v as RoadmapItemStatus })}
              options={ROADMAP_ITEM_STATUSES.map((s) => ({ value: s, label: ROADMAP_ITEM_STATUS_LABEL[s] }))}
            />
          </Field>
          <Field label={t('roadmaps.difficulty')}>
            <Select
              value={form.difficulty}
              onValueChange={(v) => set({ difficulty: v as RoadmapDifficulty })}
              options={ROADMAP_DIFFICULTIES.map((d) => ({ value: d, label: ROADMAP_DIFFICULTY_LABEL[d] }))}
            />
          </Field>
          <Field label={t('roadmaps.progress')}>
            <Input type="number" min={0} max={100} value={form.progress} onChange={(e) => set({ progress: num(e.target.value) })} />
          </Field>
          <Field label={t('roadmaps.reach')}>
            <Input type="number" min={0} value={form.reach} onChange={(e) => set({ reach: num(e.target.value) })} />
          </Field>
          <Field label={t('roadmaps.impact')}>
            <Input type="number" min={0} step="0.5" value={form.impact} onChange={(e) => set({ impact: num(e.target.value) })} />
          </Field>
          <Field label={t('roadmaps.confidence')}>
            <Input type="number" min={0} max={100} value={form.confidence} onChange={(e) => set({ confidence: num(e.target.value) })} />
          </Field>
          <Field label={t('roadmaps.effort')}>
            <Input type="number" min={0} step="0.5" value={form.effort} onChange={(e) => set({ effort: num(e.target.value) })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="ri-desc">
          <Textarea id="ri-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </form>
      {item && roadmapId && (
        <TaskPanel
          roadmapId={roadmapId}
          projectId={projectId ?? ''}
          itemId={item.id}
          itemLabel={`${ROADMAP_PHASE_LABEL[item.phase]} · ${item.title}`}
        />
      )}
    </Dialog>
  );
}
