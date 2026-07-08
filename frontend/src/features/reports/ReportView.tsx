import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { t } from '@/i18n';
import {
  FeatureStatus,
  Role,
  SECTION_TYPE_LABEL,
  SectionType,
} from '@/types/enums';
import type { ReportDto, ReportSection, TestCaseData, TestingSection } from '@/types/dto';
import { useUsers } from '@/features/users/api';
import { ReportSectionBlock } from './components/ReportSections';
import {
  useReplaceSections,
  useReport,
  useReports,
  useUpdateReport,
} from './api';

const STATUS_OPTIONS = [FeatureStatus.TESTING, FeatureStatus.DONE, FeatureStatus.INFO];
const SECTION_ORDER: SectionType[] = [
  SectionType.OVERVIEW,
  SectionType.SCREENSHOT,
  SectionType.CARDS,
  SectionType.STEPS,
  SectionType.BULLETS,
  SectionType.ORDERED,
  SectionType.TESTING,
];

const STATUS_BADGE: Record<FeatureStatus, string> = {
  [FeatureStatus.DONE]: 'badge-success',
  [FeatureStatus.INFO]: 'badge-info',
  [FeatureStatus.TESTING]: 'badge-warning',
};

function newSection(type: SectionType, position: number): ReportSection {
  const id = crypto.randomUUID();
  const title = `${position}. ${SECTION_TYPE_LABEL[type]}`;
  switch (type) {
    case SectionType.OVERVIEW:
      return { id, type, title, paragraphs: [''] };
    case SectionType.SCREENSHOT:
      return { id, type, title, images: [] };
    case SectionType.CARDS:
      return { id, type, title, cards: [] };
    case SectionType.STEPS:
      return { id, type, title, steps: [] };
    case SectionType.BULLETS:
      return { id, type, title, items: [] };
    case SectionType.ORDERED:
      return { id, type, title, items: [] };
    case SectionType.TESTING:
      return { id, type, title, banner: { title: '', description: '' }, coverage: [], cases: [] };
  }
}

export function ReportView() {
  const { projectId, reportId } = useParams<{ projectId: string; reportId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const canWrite = isAdmin || user?.role === Role.TESTER;

  const { data: reports } = useReports(projectId);
  const effectiveId = reportId ?? reports?.[0]?.id;
  const { data: report, isLoading } = useReport(projectId, effectiveId);
  const update = useUpdateReport(projectId ?? '');
  const replaceSections = useReplaceSections(projectId ?? '');
  const { data: usersData } = useUsers({ limit: 100 }, !!isAdmin);
  const userNames = usersData?.items.map((u) => u.name || u.email) ?? [];

  const sections = report?.sections ?? [];

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const s of sections)
      if (s.type === SectionType.TESTING)
        for (const c of (s as TestingSection).cases) if (c.owner) set.add(c.owner);
    if (report?.owner) set.add(report.owner);
    for (const n of userNames) set.add(n);
    return [...set].sort();
  }, [sections, report?.owner, userNames]);

  if (isLoading) {
    return (
      <article className="report" style={{ padding: 28 }}>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </article>
    );
  }
  if (!report) {
    return (
      <div
        className="report"
        style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}
      >
        {t('project.selectFeature')}
      </div>
    );
  }

  const saveSections = (next: ReportSection[]) =>
    replaceSections.mutate({ id: report.id, sections: next });
  const updateAt = (i: number, updated: ReportSection) =>
    saveSections(sections.map((s, j) => (j === i ? updated : s)));
  const deleteAt = (i: number) => saveSections(sections.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const copy = [...sections];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    saveSections(copy);
  };

  // Other features in the project — targets for moving a test case.
  const otherFeatures = (reports ?? [])
    .filter((r) => r.id !== report.id)
    .map((r) => ({ id: r.id, label: r.label || r.title, featureId: r.featureId }));

  /** Move a test case out of this report and into another feature's testing section. */
  const moveCase = async (caseData: TestCaseData, targetReportId: string) => {
    const target = await apiGet<ReportDto>(
      `/projects/${projectId}/reports/${targetReportId}`,
    );
    const tSections = [...(target.sections ?? [])];
    let ti = tSections.findIndex((s) => s.type === SectionType.TESTING);
    if (ti < 0) {
      tSections.push({
        id: crypto.randomUUID(),
        type: SectionType.TESTING,
        title: 'Testing',
        banner: { title: '', description: '' },
        coverage: [],
        cases: [],
      });
      ti = tSections.length - 1;
    }
    const ts = tSections[ti] as TestingSection;
    tSections[ti] = { ...ts, cases: [...ts.cases, caseData] };
    await replaceSections.mutateAsync({ id: targetReportId, sections: tSections });
    const cur = sections.map((s) =>
      s.type === SectionType.TESTING
        ? { ...s, cases: (s as TestingSection).cases.filter((cc) => cc.id !== caseData.id) }
        : s,
    );
    await replaceSections.mutateAsync({ id: report.id, sections: cur });
  };

  return (
    <>
      <article className="report">
        <header className="report-header">
          {canWrite ? (
            <>
              <input
                className="edit-report-title"
                type="text"
                value={report.title}
                placeholder="Feature title"
                onChange={(e) => update.mutate({ id: report.id, input: { title: e.target.value } })}
              />
              <input
                className="edit-report-subtitle"
                type="text"
                value={report.subtitle}
                placeholder="Subtitle"
                onChange={(e) =>
                  update.mutate({ id: report.id, input: { subtitle: e.target.value } })
                }
              />
            </>
          ) : (
            <>
              <h1>{report.title}</h1>
              {report.subtitle && <p className="report-subtitle">{report.subtitle}</p>}
            </>
          )}
        </header>

        <div className="meta-bar">
          <div className="meta-item">
            <span className="label">Feature ID</span>
            <span className="value is-mono">
              {canWrite ? (
                <input
                  className="edit-feature-id"
                  type="text"
                  value={report.featureId}
                  placeholder="e.g. F-001"
                  onChange={(e) =>
                    update.mutate({ id: report.id, input: { featureId: e.target.value } })
                  }
                />
              ) : (
                report.featureId
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Module</span>
            <span className="value">
              {canWrite ? (
                <input
                  className="edit-feature-id"
                  type="text"
                  value={report.module}
                  placeholder="e.g. Auth"
                  onChange={(e) =>
                    update.mutate({ id: report.id, input: { module: e.target.value } })
                  }
                />
              ) : (
                report.module
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Status</span>
            <span className="value">
              {canWrite ? (
                <StatusSelect
                  value={report.statusVariant}
                  onChange={(v) => update.mutate({ id: report.id, input: { statusVariant: v } })}
                />
              ) : (
                <span className={`badge ${STATUS_BADGE[report.statusVariant]}`}>
                  {report.statusVariant}
                </span>
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Reported</span>
            <span className="value">
              {canWrite ? (
                <input
                  className="edit-feature-id"
                  type="date"
                  style={{ width: 'auto' }}
                  value={report.reported}
                  onChange={(e) =>
                    update.mutate({ id: report.id, input: { reported: e.target.value } })
                  }
                />
              ) : (
                report.reported
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="label">Owner</span>
            <span className="value">
              {canWrite ? (
                <select
                  className="owner-select"
                  value={report.owner || ''}
                  onChange={(e) => update.mutate({ id: report.id, input: { owner: e.target.value } })}
                >
                  <option value="">— Unassigned —</option>
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {report.owner && !owners.includes(report.owner) && (
                    <option value={report.owner}>{report.owner}</option>
                  )}
                </select>
              ) : (
                report.owner
              )}
            </span>
          </div>
        </div>

        <div className="report-content">
          {sections.length === 0 ? (
            <div
              style={{
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--muted)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p style={{ margin: 0 }}>{t('report.emptyBody')}</p>
              {canWrite && (
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>{t('report.emptyBodyHint')}</p>
              )}
            </div>
          ) : (
            sections.map((section, i) => (
              <ReportSectionBlock
                key={section.id}
                section={section}
                index={i}
                total={sections.length}
                canWrite={canWrite}
                userName={user?.name}
                users={owners}
                features={otherFeatures}
                onMoveCase={moveCase}
                onChange={(updated) => updateAt(i, updated)}
                onDelete={() => {
                  if (window.confirm('Remove this section and its contents?')) deleteAt(i);
                }}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
              />
            ))
          )}
        </div>

        <footer className="report-footer">
          Software &amp; QA Platform — Feature Report generated on {report.reported}
        </footer>
      </article>

      {canWrite && (
        <AddSectionFab
          onAdd={(type) => saveSections([...sections, newSection(type, sections.length + 1)])}
        />
      )}
    </>
  );
}

/** Badge-styled status picker (dot + label + chevron) with a small popover. */
function StatusSelect({
  value,
  onChange,
}: {
  value: FeatureStatus;
  onChange: (v: FeatureStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`badge ${STATUS_BADGE[value]} edit-status-variant`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Status — controls badge color and sidebar dot"
      >
        {value}
        <span aria-hidden style={{ marginLeft: 2, fontSize: 9 }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="add-section-menu" role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 130, zIndex: 50 }}>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === value}
              className="add-section-menu-item"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              <span className={`badge ${STATUS_BADGE[s]}`} style={{ pointerEvents: 'none' }}>
                {s}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fixed + button that opens the "Add section" type menu. */
function AddSectionFab({ onAdd }: { onAdd: (type: SectionType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={`add-section-fab${open ? ' add-section-fab-open' : ''}`}>
      {open && (
        <div className="add-section-menu" role="menu">
          <div className="add-section-menu-title">{t('report.addSection')}</div>
          {SECTION_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className={`add-section-menu-item type-${type}`}
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
            >
              <span className="add-section-menu-dot" aria-hidden />
              <span className="add-section-menu-label">{SECTION_TYPE_LABEL[type]}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="add-section-fab-btn"
        aria-label={open ? 'Close add section menu' : t('report.addSection')}
        aria-expanded={open}
        title={t('report.addSection')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '+'}
      </button>
    </div>
  );
}
