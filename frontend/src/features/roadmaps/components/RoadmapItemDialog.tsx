import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { t } from '@/i18n';
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
}

export function RoadmapItemDialog({ open, onClose, item, defaultPhase, onSave }: RoadmapItemDialogProps) {
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
            <Select value={form.phase} onChange={(e) => set({ phase: e.target.value as RoadmapPhase })}>
              {ROADMAP_PHASES.map((p) => (
                <option key={p} value={p}>
                  {ROADMAP_PHASE_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('roadmaps.status')}>
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as RoadmapItemStatus })}>
              {ROADMAP_ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ROADMAP_ITEM_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('roadmaps.difficulty')}>
            <Select value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value as RoadmapDifficulty })}>
              {ROADMAP_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {ROADMAP_DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </Select>
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
    </Dialog>
  );
}
