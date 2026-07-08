import { Fragment, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { SECTION_TYPE_COLOR, TestResult } from '@/types/enums';
import type { CoverageBar, TestCaseData, TestingSection } from '@/types/dto';
import { ResultSelect } from './ResultSelect';
import { TypeSelect } from './TypeSelect';
import { OwnerSelect } from './OwnerSelect';
import { CaseDetailEditor } from './CaseDetailEditor';

interface TestingTableProps {
  section: TestingSection;
  canWrite: boolean;
  /** Workspace user names for the owner picker (empty for non-admins/public). */
  users?: string[];
  /** Live, audited single-result change (backend records history). */
  onSetResult: (shortId: string, result: TestResult) => void;
  /** Structural edit (banner/coverage/case fields) → replaces the section. */
  onChangeSection: (updated: TestingSection) => void;
  onImport: () => void;
  /** Section-level actions (writers only; omitted in the public read view). */
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const clampPct = (v: string) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

export function TestingTable({
  section,
  canWrite,
  users = [],
  onSetResult,
  onChangeSection,
  onImport,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TestingTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const cases = section.cases ?? [];
  const coverage = section.coverage ?? [];
  const banner = section.banner ?? { title: '', description: '' };
  const colSpan = canWrite ? 9 : 7;

  const ownerOptions = Array.from(
    new Set([...users, ...cases.map((c) => c.owner).filter(Boolean)]),
  );

  function patchSection(fields: Partial<TestingSection>) {
    onChangeSection({ ...section, ...fields });
  }

  // ── cases ──────────────────────────────────────────────────────────────
  function addCase() {
    const c: TestCaseData = {
      id: crypto.randomUUID(),
      shortId: `TC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      area: '',
      type: '',
      result: TestResult.UNTESTED,
      owner: '',
    };
    patchSection({ cases: [...cases, c] });
  }
  function editCase(id: string, patch: Partial<TestCaseData>) {
    patchSection({ cases: cases.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function removeCase(id: string) {
    if (openId === id) setOpenId(null);
    patchSection({ cases: cases.filter((c) => c.id !== id) });
  }
  function reorder(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...cases];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    patchSection({ cases: next });
  }

  // ── coverage ───────────────────────────────────────────────────────────
  function addCoverage() {
    patchSection({ coverage: [...coverage, { label: '', percent: 0 }] });
  }
  function editCoverage(i: number, patch: Partial<CoverageBar>) {
    patchSection({ coverage: coverage.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }
  function removeCoverage(i: number) {
    patchSection({ coverage: coverage.filter((_, idx) => idx !== i) });
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-l-4 bg-card p-4 shadow-sm sm:p-5"
      style={{ borderLeftColor: SECTION_TYPE_COLOR[section.type] }}
    >
      {/* Section header — title + move/delete (writers only) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {canWrite ? (
            <Input
              className="max-w-[400px] border-transparent bg-transparent text-[15px] font-semibold shadow-none hover:border-input"
              defaultValue={section.title}
              placeholder={t('report.sectionTitle')}
              onBlur={(e) => e.target.value !== section.title && patchSection({ title: e.target.value })}
            />
          ) : (
            <h3 className="text-[15px] font-semibold">{section.title}</h3>
          )}
        </div>
        {canWrite && (onMoveUp || onMoveDown || onDelete) && (
          <div className="flex shrink-0 items-center gap-1">
            {onMoveUp && (
              <button
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('groups.moveUp')}
                title={t('groups.moveUp')}
                onClick={onMoveUp}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
            {onMoveDown && (
              <button
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('groups.moveDown')}
                title={t('groups.moveDown')}
                onClick={onMoveDown}
              >
                <ArrowDown className="size-4" />
              </button>
            )}
            {onDelete && (
              <button
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label={t('report.deleteSection')}
                title={t('report.deleteSection')}
                onClick={() => confirm(t('report.confirmDeleteSection')) && onDelete()}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status banner */}
      {canWrite ? (
        <div
          className="rounded-md border border-l-4 p-3"
          style={{
            borderLeftColor: 'hsl(var(--warning))',
            backgroundColor: 'hsl(var(--warning) / 0.08)',
          }}
        >
          <Input
            className="border-transparent bg-transparent text-[15px] font-semibold shadow-none hover:border-input"
            defaultValue={banner.title}
            placeholder={t('report.statusTitle')}
            onBlur={(e) =>
              e.target.value !== banner.title &&
              patchSection({ banner: { ...banner, title: e.target.value } })
            }
          />
          <Textarea
            className="mt-1 border-transparent bg-transparent shadow-none hover:border-input"
            defaultValue={banner.description}
            placeholder={t('report.statusDescription')}
            onBlur={(e) =>
              e.target.value !== banner.description &&
              patchSection({ banner: { ...banner, description: e.target.value } })
            }
          />
        </div>
      ) : banner.title || banner.description ? (
        <div
          className="rounded-md border border-l-4 p-3"
          style={{
            borderLeftColor: 'hsl(var(--warning))',
            backgroundColor: 'hsl(var(--warning) / 0.08)',
          }}
        >
          {banner.title && <p className="text-[15px] font-semibold">{banner.title}</p>}
          {banner.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {banner.description}
            </p>
          )}
        </div>
      ) : null}

      {/* Coverage */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold">{t('report.coverage')}</h4>
          {canWrite && (
            <Button size="sm" variant="secondary" onClick={addCoverage}>
              <Plus className="size-4" /> {t('report.addRow')}
            </Button>
          )}
        </div>
        {canWrite
          ? coverage.map((cov, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="h-8 flex-1"
                  defaultValue={cov.label}
                  placeholder={t('report.coverageLabel')}
                  onBlur={(e) => e.target.value !== cov.label && editCoverage(i, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 w-20"
                  defaultValue={cov.percent}
                  onBlur={(e) => editCoverage(i, { percent: clampPct(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">%</span>
                <button
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  aria-label={t('common.delete')}
                  onClick={() => removeCoverage(i)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          : coverage.map((cov, i) => (
              <div
                key={i}
                className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-xs sm:grid-cols-[160px_1fr_40px]"
              >
                <span className="truncate text-muted-foreground">{cov.label}</span>
                <ProgressBar value={cov.percent} />
                <span className="text-right text-muted-foreground">{cov.percent}%</span>
              </div>
            ))}
      </div>

      {/* Test case summary */}
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-sm font-semibold">{t('report.caseSummary')}</h4>
        <span className="text-xs text-muted-foreground">{cases.length}</span>
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={addCase}>
              <Plus className="size-4" /> {t('report.addRow')}
            </Button>
            <Button size="sm" variant="secondary" onClick={onImport}>
              <Upload className="size-4" /> {t('report.importCase')}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="[&>th]:text-xs [&>th]:uppercase [&>th]:tracking-wide">
              {canWrite && <TableHead className="w-8" aria-label="reorder" />}
              <TableHead className="w-8" aria-label="detail" />
              <TableHead>{t('report.colId')}</TableHead>
              <TableHead>{t('report.colArea')}</TableHead>
              <TableHead>{t('report.colType')}</TableHead>
              <TableHead>{t('report.colResult')}</TableHead>
              <TableHead>{t('report.colOwner')}</TableHead>
              <TableHead>{t('report.colBugs')}</TableHead>
              {canWrite && <TableHead aria-label="actions" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                  {t('report.noCases')}
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c, i) => {
                const open = openId === c.id;
                const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
                return (
                  <Fragment key={c.id}>
                    <TableRow
                      className={cn(
                        'transition-colors hover:bg-muted/40',
                        isOver && 'border-t-2 border-t-primary',
                      )}
                      draggable={canWrite}
                      onDragStart={canWrite ? () => setDragIndex(i) : undefined}
                      onDragOver={
                        canWrite
                          ? (e) => {
                              if (dragIndex === null || dragIndex === i) return;
                              e.preventDefault();
                              if (overIndex !== i) setOverIndex(i);
                            }
                          : undefined
                      }
                      onDrop={canWrite ? (e) => { e.preventDefault(); reorder(i); } : undefined}
                      onDragEnd={canWrite ? () => { setDragIndex(null); setOverIndex(null); } : undefined}
                    >
                      {canWrite && (
                        <TableCell className="pr-0">
                          <span
                            className="inline-flex cursor-grab text-muted-foreground active:cursor-grabbing"
                            title={t('report.drag')}
                          >
                            <GripVertical className="size-4" />
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="pr-0">
                        <button
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-expanded={open}
                          aria-label={t('report.editDetail')}
                          title={t('report.editDetail')}
                          onClick={() => setOpenId(open ? null : c.id)}
                        >
                          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {c.shortId}
                        </span>
                      </TableCell>
                      <TableCell>
                        {canWrite ? (
                          <Input
                            className="h-8 min-w-[160px]"
                            defaultValue={c.area}
                            placeholder={t('report.newArea')}
                            onBlur={(e) => e.target.value !== c.area && editCase(c.id, { area: e.target.value })}
                          />
                        ) : (
                          c.area || t('common.none')
                        )}
                      </TableCell>
                      <TableCell>
                        <TypeSelect
                          value={c.type}
                          disabled={!canWrite}
                          onChange={(type) => editCase(c.id, { type })}
                        />
                      </TableCell>
                      <TableCell>
                        <ResultSelect
                          value={c.result}
                          disabled={!canWrite}
                          onChange={(r) => onSetResult(c.shortId, r)}
                        />
                      </TableCell>
                      <TableCell>
                        <OwnerSelect
                          value={c.owner}
                          options={ownerOptions}
                          disabled={!canWrite}
                          onChange={(owner) => editCase(c.id, { owner })}
                        />
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                          title={t('report.bugsHint')}
                        >
                          <Bug className="size-3.5" /> 0
                        </span>
                      </TableCell>
                      {canWrite && (
                        <TableCell>
                          <button
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                            aria-label={t('common.delete')}
                            onClick={() => removeCase(c.id)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={colSpan} className="p-4">
                          <CaseDetailEditor
                            testCase={c}
                            canWrite={canWrite}
                            onChange={(patch) => editCase(c.id, patch)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
