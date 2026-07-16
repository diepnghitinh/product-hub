import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { ColorSelect, type ColorOption } from '@/components/ui';
import { CaseEditDialog } from './CaseEditDialog';
import type {
  BulletsSection,
  CardsSection,
  OrderedSection,
  OverviewSection,
  ReportSection,
  ScreenshotSection,
  StepsSection,
  TestCaseData,
  TestingSection,
} from '@/types/dto';
import {
  SectionType,
  TEST_RESULTS,
  TEST_TYPE_COLOR,
  TEST_TYPES,
  TestResult,
  TestType,
} from '@/types/enums';

/** Result → a workspace CSS custom-property color (hex-backed, light theme). */
const RESULT_VAR: Record<TestResult, string> = {
  [TestResult.PASSED]: 'var(--success)',
  [TestResult.FAILED]: 'var(--danger)',
  [TestResult.BLOCKED]: 'var(--warning)',
  [TestResult.RETEST]: 'var(--info)',
  [TestResult.SKIPPED]: 'var(--muted)',
  [TestResult.UNTESTED]: 'var(--faint)',
};

const TYPE_OPTIONS: ColorOption[] = [
  { value: '', label: '—', color: 'var(--muted)' },
  ...TEST_TYPES.map((tt) => ({ value: tt, label: tt, color: TEST_TYPE_COLOR[tt] })),
];
const RESULT_OPTIONS: ColorOption[] = TEST_RESULTS.map((r) => ({
  value: r,
  label: r,
  color: RESULT_VAR[r],
}));

interface SectionProps<S extends ReportSection = ReportSection> {
  section: S;
  index: number;
  total: number;
  canWrite: boolean;
  /** Current user's display name — powers the testing "Assigned to me" filter. */
  userName?: string;
  /** Assignable users (name/email) — for the test-case Owner picker. */
  users?: string[];
  /** Other features in the project — targets for "move test case to feature". */
  features?: { id: string; label: string; featureId: string }[];
  /** Move a test case from this report to another feature (report). */
  onMoveCase?: (caseData: TestCaseData, targetReportId: string) => void;
  /** Open the "Import test cases" dialog for this report. */
  onImport?: () => void;
  /** Count of linked bugs per test-case id — drives the Bugs column badge. */
  bugCountByCase?: Record<string, number>;
  /** Open "Report bug" prefilled + linked to a test case. */
  onCreateBug?: (opts: { caseId: string; caseLabel: string }) => void;
  /** Navigate to the Bugs board filtered to a test case's linked bugs. */
  onOpenBugs?: (opts: { caseId: string; caseLabel: string }) => void;
  onChange: (updated: ReportSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** The numbered/typed section heading with hover move/remove controls. */
function SectionTitle({
  title,
  type,
  editable,
  index,
  total,
  canWrite,
  onTitle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  type: SectionType;
  editable: boolean;
  index: number;
  total: number;
  canWrite: boolean;
  onTitle: (v: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <h2 className={`section-title type-${type}`}>
      <div className="section-title-row">
        {!canWrite || !editable ? (
          <span>{title}</span>
        ) : (
          <input
            className="edit-section-title"
            type="text"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
          />
        )}
        {canWrite && (
          <div className="section-controls">
            <button
              type="button"
              className="section-ctrl-btn"
              title="Move section up"
              aria-label="Move section up"
              disabled={index === 0}
              onClick={onMoveUp}
            >
              ↑
            </button>
            <button
              type="button"
              className="section-ctrl-btn"
              title="Move section down"
              aria-label="Move section down"
              disabled={index === total - 1}
              onClick={onMoveDown}
            >
              ↓
            </button>
            <button
              type="button"
              className="section-ctrl-btn section-ctrl-remove"
              title="Remove section"
              aria-label="Remove section"
              onClick={onDelete}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </h2>
  );
}

/** Per-row "move to another feature" popover — lists the other features. */
function MoveCaseMenu({
  features,
  onMove,
}: {
  features: { id: string; label: string; featureId: string }[];
  onMove: (targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // Close on page scroll, but not when scrolling inside the (fixed) menu itself.
    const onScroll = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const desired = Math.min(260, features.length * 34 + 40);
      const flipUp = spaceBelow < desired && spaceAbove > spaceBelow;
      setMenuStyle({
        position: 'fixed',
        left: r.left,
        minWidth: 210,
        maxHeight: Math.min(260, Math.max(0, flipUp ? spaceAbove : spaceBelow)),
        ...(flipUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    }
    setOpen(true);
  };

  return (
    <span className="move-wrap" ref={wrapRef} style={{ display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className="cell-move-btn"
        title="Move to another feature"
        aria-label="Move to another feature"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <ArrowRightLeft className="size-3.5" aria-hidden />
      </button>
      {open && menuStyle && (
        <div className="color-select-menu" role="menu" style={menuStyle}>
          <div className="move-menu-title">Move to feature</div>
          {features.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className="move-menu-item"
              onClick={() => {
                onMove(f.id);
                setOpen(false);
              }}
            >
              <span>{f.label}</span>
              {f.featureId && <span className="move-menu-id">{f.featureId}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Overview({ section, canWrite, onChange, ...rest }: SectionProps<OverviewSection>) {
  const paragraphs = section.paragraphs ?? [];
  const set = (next: string[]) => onChange({ ...section, paragraphs: next });
  return (
    <div className="section">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      {paragraphs.map((p, i) =>
        canWrite ? (
          <div className="edit-paragraph-row" key={i}>
            <textarea
              className="edit-paragraph"
              value={p}
              placeholder="Paragraph text"
              onChange={(e) =>
                set(paragraphs.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
            <button
              type="button"
              className="row-remove"
              title="Remove this paragraph"
              onClick={() => set(paragraphs.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ) : (
          <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
        ),
      )}
      {canWrite && (
        <button
          type="button"
          className="inline-btn block-btn"
          title="Add a new paragraph"
          onClick={() => set([...paragraphs, ''])}
        >
          + Add paragraph
        </button>
      )}
    </div>
  );
}

function Bullets({ section, canWrite, onChange, ...rest }: SectionProps<BulletsSection>) {
  const items = section.items ?? [];
  const set = (next: string[]) => onChange({ ...section, items: next });
  return (
    <div className="section section-bullets">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      <ul className="list-bullets">
        {items.map((it, i) => (
          <li className="list-item-bullets" key={i}>
            {canWrite ? (
              <>
                <textarea
                  className="edit-paragraph"
                  rows={1}
                  value={it}
                  onChange={(e) =>
                    set(items.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
                <button
                  type="button"
                  className="row-remove"
                  title="Remove item"
                  onClick={() => set(items.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </>
            ) : (
              <span>{it}</span>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <button type="button" className="inline-btn block-btn" onClick={() => set([...items, ''])}>
          + Add item
        </button>
      )}
    </div>
  );
}

function Ordered({ section, canWrite, onChange, ...rest }: SectionProps<OrderedSection>) {
  const items = section.items ?? [];
  const set = (next: string[]) => onChange({ ...section, items: next });
  return (
    <div className="section section-ordered">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      <ol className="list-ordered">
        {items.map((it, i) => (
          <li className="list-item-ordered" key={i}>
            {canWrite ? (
              <>
                <textarea
                  className="edit-paragraph"
                  rows={1}
                  value={it}
                  onChange={(e) =>
                    set(items.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
                <button
                  type="button"
                  className="row-remove"
                  title="Remove item"
                  onClick={() => set(items.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </>
            ) : (
              <span>{it}</span>
            )}
          </li>
        ))}
      </ol>
      {canWrite && (
        <button type="button" className="inline-btn block-btn" onClick={() => set([...items, ''])}>
          + Add item
        </button>
      )}
    </div>
  );
}

function Cards({ section, canWrite, onChange, ...rest }: SectionProps<CardsSection>) {
  const cards = section.cards ?? [];
  const set = (next: CardsSection['cards']) => onChange({ ...section, cards: next });
  return (
    <div className="section">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      <div className="card-grid">
        {cards.map((c, i) => (
          <div className="card" key={i}>
            {canWrite ? (
              <>
                <input
                  className="edit-feature-id"
                  style={{ width: '100%', marginBottom: 6 }}
                  value={c.name}
                  placeholder="Name"
                  onChange={(e) =>
                    set(cards.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))
                  }
                />
                <textarea
                  className="edit-paragraph"
                  rows={2}
                  value={c.desc}
                  placeholder="Description"
                  onChange={(e) =>
                    set(cards.map((v, j) => (j === i ? { ...v, desc: e.target.value } : v)))
                  }
                />
                <button
                  type="button"
                  className="inline-btn"
                  style={{ marginTop: 6 }}
                  onClick={() => set(cards.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <div className="card-name">{c.name}</div>
                <div className="card-desc">{c.desc}</div>
              </>
            )}
          </div>
        ))}
      </div>
      {canWrite && (
        <button
          type="button"
          className="inline-btn block-btn"
          onClick={() => set([...cards, { name: '', desc: '' }])}
        >
          + Add card
        </button>
      )}
    </div>
  );
}

function Steps({ section, canWrite, onChange, ...rest }: SectionProps<StepsSection>) {
  const steps = section.steps ?? [];
  const set = (next: StepsSection['steps']) => onChange({ ...section, steps: next });
  return (
    <div className="section">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      <div className="step-list">
        {steps.map((s, i) => (
          <div className="step-item" key={i}>
            <div>
              <span className="step-num">{i + 1}</span>
              {canWrite ? (
                <input
                  className="edit-feature-id"
                  style={{ width: 'calc(100% - 32px)' }}
                  value={s.name}
                  placeholder="Step name"
                  onChange={(e) =>
                    set(steps.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))
                  }
                />
              ) : (
                <span className="step-name">{s.name}</span>
              )}
            </div>
            {canWrite ? (
              <>
                <textarea
                  className="edit-paragraph"
                  rows={2}
                  style={{ marginTop: 6 }}
                  value={s.desc}
                  placeholder="Step description"
                  onChange={(e) =>
                    set(steps.map((v, j) => (j === i ? { ...v, desc: e.target.value } : v)))
                  }
                />
                <button
                  type="button"
                  className="inline-btn"
                  style={{ marginTop: 6 }}
                  onClick={() => set(steps.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </>
            ) : (
              <div className="step-desc">{s.desc}</div>
            )}
          </div>
        ))}
      </div>
      {canWrite && (
        <button
          type="button"
          className="inline-btn block-btn"
          onClick={() =>
            set([...steps, { num: steps.length + 1, name: '', desc: '' }])
          }
        >
          + Add step
        </button>
      )}
    </div>
  );
}

function Screenshot({ section, canWrite, onChange, ...rest }: SectionProps<ScreenshotSection>) {
  const images = section.images ?? [];
  const set = (next: ScreenshotSection['images']) => onChange({ ...section, images: next });
  return (
    <div className="section">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />
      {images.map((img, i) => (
        <figure className="screenshot" key={i} style={{ margin: '16px 0' }}>
          {img.src ? <img src={img.src} alt={img.alt ?? ''} /> : null}
          {canWrite ? (
            <input
              className="edit-menu-label"
              style={{ width: '100%', border: 0, padding: '8px 12px' }}
              value={img.caption ?? ''}
              placeholder="Caption"
              onChange={(e) =>
                set(images.map((v, j) => (j === i ? { ...v, caption: e.target.value } : v)))
              }
            />
          ) : (
            img.caption && <figcaption className="screenshot-caption">{img.caption}</figcaption>
          )}
          {canWrite && (
            <button
              type="button"
              className="inline-btn"
              style={{ margin: 8 }}
              onClick={() => set(images.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          )}
        </figure>
      ))}
      {canWrite && (
        <button
          type="button"
          className="inline-btn block-btn"
          onClick={() => {
            const src = window.prompt('Image URL');
            if (src?.trim()) set([...images, { src: src.trim(), alt: '', caption: '' }]);
          }}
        >
          + Add image
        </button>
      )}
    </div>
  );
}

function Testing({
  section,
  canWrite,
  userName,
  users = [],
  features = [],
  onMoveCase,
  onImport,
  bugCountByCase,
  onCreateBug,
  onOpenBugs,
  onChange,
  ...rest
}: SectionProps<TestingSection>) {
  const bugsEnabled = !!onCreateBug || !!onOpenBugs;
  const caseLabelOf = (c: TestCaseData) =>
    [c.shortId, c.area].filter(Boolean).join(' · ') || c.shortId || 'Test case';
  const banner = section.banner ?? { title: '', description: '' };
  const coverage = section.coverage ?? [];
  const cases = section.cases ?? [];

  const clampPct = (n: number) =>
    Math.max(0, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0));
  const setCoverage = (i: number, patch: Partial<TestingSection['coverage'][number]>) =>
    onChange({
      ...section,
      coverage: coverage.map((v, j) => (j === i ? { ...v, ...patch } : v)),
    });
  const addCoverage = () =>
    onChange({ ...section, coverage: [...coverage, { label: '', percent: 0 }] });
  const removeCoverage = (i: number) =>
    onChange({ ...section, coverage: coverage.filter((_, j) => j !== i) });

  const setCase = (id: string, patch: Partial<TestingSection['cases'][number]>) =>
    onChange({ ...section, cases: cases.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const moveCase = (id: string, dir: -1 | 1) => {
    const idx = cases.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= cases.length) return;
    const copy = [...cases];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    onChange({ ...section, cases: copy });
  };

  const [assignee, setAssignee] = useState('all');
  const [editingCase, setEditingCase] = useState<TestCaseData | null>(null);
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) if (c.owner) set.add(c.owner);
    return [...set].sort();
  }, [cases]);
  const shownCases = useMemo(() => {
    if (assignee === 'all') return cases;
    if (assignee === 'unassigned') return cases.filter((c) => !c.owner);
    if (assignee === 'me') return cases.filter((c) => !!userName && c.owner === userName);
    return cases.filter((c) => c.owner === assignee);
  }, [cases, assignee, userName]);

  return (
    <div className="section">
      <SectionTitle
        {...rest}
        title={section.title}
        type={section.type}
        editable
        canWrite={canWrite}
        onTitle={(title) => onChange({ ...section, title })}
      />

      <div className="report-filterbar">
        <label className="report-filter">
          <span className="report-filter-label">Assignee</span>
          <select
            className="report-filter-select"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="all">Everyone</option>
            {userName && <option value="me">Assigned to me</option>}
            <option value="unassigned">Unassigned</option>
            {owners.length > 0 && (
              <optgroup label="People">
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {assignee !== 'all' && cases.length > 0 && (
          <span className="report-filter-summary">
            {shownCases.length} of {cases.length} case{cases.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="status-card">
        {canWrite ? (
          <>
            <input
              className="status-title status-title-edit"
              type="text"
              value={banner.title}
              placeholder="Status title"
              onChange={(e) =>
                onChange({ ...section, banner: { ...banner, title: e.target.value } })
              }
            />
            <textarea
              className="status-desc status-desc-edit"
              rows={2}
              value={banner.description}
              placeholder="Status description"
              onChange={(e) =>
                onChange({ ...section, banner: { ...banner, description: e.target.value } })
              }
            />
          </>
        ) : (
          <>
            <div className="status-title">{banner.title}</div>
            <p className="status-desc">{banner.description}</p>
          </>
        )}
      </div>

      {(coverage.length > 0 || canWrite) && (
        <>
          <h3>Test Coverage Progress</h3>
          {coverage.map((c, i) => {
            const yes = clampPct(c.percent) >= 100;
            if (!canWrite) {
              return (
                <div className="coverage-row" key={i}>
                  <div className="coverage-label">{c.label}</div>
                  <span className={`badge ${yes ? 'badge-success' : 'badge-muted'}`}>
                    {yes ? 'Yes' : 'No'}
                  </span>
                </div>
              );
            }
            return (
              <div className="coverage-row" key={i}>
                <input
                  className="edit-cell"
                  type="text"
                  value={c.label}
                  placeholder="Coverage item (e.g. Happy path)"
                  onChange={(e) => setCoverage(i, { label: e.target.value })}
                />
                <div className="yesno" role="group" aria-label="Covered?">
                  <button
                    type="button"
                    className={`yesno-opt is-yes${yes ? ' is-active' : ''}`}
                    aria-pressed={yes}
                    onClick={() => setCoverage(i, { percent: 100 })}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={`yesno-opt is-no${!yes ? ' is-active' : ''}`}
                    aria-pressed={!yes}
                    onClick={() => setCoverage(i, { percent: 0 })}
                  >
                    No
                  </button>
                </div>
                <button
                  type="button"
                  className="row-remove"
                  title="Remove this item"
                  aria-label="Remove coverage item"
                  onClick={() => removeCoverage(i)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {canWrite && (
            <button type="button" className="inline-btn block-btn" onClick={addCoverage}>
              + Add coverage item
            </button>
          )}
        </>
      )}

      {(cases.length > 0 || (canWrite && !!onImport)) && (
        <>
          <h3>
            Test Case Summary
            {canWrite && onImport && (
              <span className="h3-actions">
                <button type="button" className="inline-btn" onClick={onImport}>
                  ↥ Import
                </button>
              </span>
            )}
          </h3>
          {cases.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>
              No test cases yet — use Import to add them from a file.
            </p>
          ) : (
            <table>
            <thead>
              <tr>
                {canWrite && <th style={{ width: 1 }} aria-label="Reorder" />}
                <th>ID</th>
                <th>Area</th>
                <th>Type</th>
                <th>Result</th>
                <th>Owner</th>
                {bugsEnabled && <th>Bugs</th>}
              </tr>
            </thead>
            <tbody>
              {shownCases.map((c) => {
                const realIdx = cases.findIndex((x) => x.id === c.id);
                const locked = assignee !== 'all';
                return (
                  <tr key={c.id}>
                    {canWrite && (
                      <td>
                        <div className="cell-controls">
                          <div className="cell-reorder">
                            <button
                              type="button"
                              title={locked ? 'Clear the assignee filter to reorder' : 'Move up'}
                              aria-label="Move test case up"
                              disabled={locked || realIdx <= 0}
                              onClick={() => moveCase(c.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              title={locked ? 'Clear the assignee filter to reorder' : 'Move down'}
                              aria-label="Move test case down"
                              disabled={locked || realIdx >= cases.length - 1}
                              onClick={() => moveCase(c.id, 1)}
                            >
                              ↓
                            </button>
                          </div>
                          {features.length > 0 && onMoveCase && (
                            <MoveCaseMenu
                              features={features}
                              onMove={(tid) => onMoveCase(c, tid)}
                            />
                          )}
                        </div>
                      </td>
                    )}
                    <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {canWrite ? (
                        <button
                          type="button"
                          className="case-open-btn"
                          title="Open &amp; edit test case"
                          onClick={() => setEditingCase(c)}
                        >
                          {c.shortId}
                        </button>
                      ) : (
                        c.shortId
                      )}
                    </td>
                    <td>
                      {canWrite ? (
                        <input
                          className="edit-cell"
                          value={c.area}
                          placeholder="Area"
                          aria-label="Area"
                          onChange={(e) => setCase(c.id, { area: e.target.value })}
                        />
                      ) : (
                        c.area
                      )}
                    </td>
                    <td>
                      {canWrite ? (
                        <ColorSelect
                          ariaLabel="Type"
                          value={c.type}
                          options={TYPE_OPTIONS}
                          onChange={(v) => setCase(c.id, { type: v as TestType | '' })}
                        />
                      ) : c.type ? (
                        <span style={{ color: TEST_TYPE_COLOR[c.type], fontWeight: 600 }}>
                          {c.type}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {canWrite ? (
                        <ColorSelect
                          ariaLabel="Result"
                          value={c.result}
                          options={RESULT_OPTIONS}
                          onChange={(v) => setCase(c.id, { result: v as TestResult })}
                        />
                      ) : (
                        <span style={{ color: RESULT_VAR[c.result], fontWeight: 600 }}>
                          {c.result}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite ? (
                        <select
                          className="edit-cell"
                          value={c.owner || ''}
                          aria-label="Owner"
                          onChange={(e) => setCase(c.id, { owner: e.target.value })}
                        >
                          <option value="">— Unassigned —</option>
                          {users.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          {c.owner && !users.includes(c.owner) && (
                            <option value={c.owner}>{c.owner}</option>
                          )}
                        </select>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>{c.owner || '—'}</span>
                      )}
                    </td>
                    {bugsEnabled && (
                      <td>
                        <span className="case-bug-cell">
                          {(() => {
                            const n = bugCountByCase?.[c.id] ?? 0;
                            return n > 0 && onOpenBugs ? (
                              <button
                                type="button"
                                className="case-bug-link"
                                title={`View ${n} linked bug${n === 1 ? '' : 's'}`}
                                onClick={() => onOpenBugs({ caseId: c.id, caseLabel: caseLabelOf(c) })}
                              >
                                🐞 {n}
                              </button>
                            ) : !onCreateBug ? (
                              <span className="case-bug-none">—</span>
                            ) : null;
                          })()}
                          {canWrite && onCreateBug && (
                            <button
                              type="button"
                              className="case-bug-add"
                              title="Report a bug for this test case"
                              onClick={() =>
                                onCreateBug({ caseId: c.id, caseLabel: caseLabelOf(c) })
                              }
                            >
                              + Bug
                            </button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
              {shownCases.length === 0 && (
                <tr>
                  <td
                    colSpan={(canWrite ? 6 : 5) + (bugsEnabled ? 1 : 0)}
                    style={{ textAlign: 'center', color: 'var(--muted)' }}
                  >
                    No test cases for this assignee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </>
      )}

      {editingCase && (
        <CaseEditDialog
          key={editingCase.id}
          testCase={editingCase}
          users={users}
          onClose={() => setEditingCase(null)}
          onSave={(updated) => {
            setCase(updated.id, updated);
            setEditingCase(null);
          }}
        />
      )}
    </div>
  );
}

/** Dispatches a single report section to its typed renderer. */
export function ReportSectionBlock(props: SectionProps) {
  switch (props.section.type) {
    case SectionType.OVERVIEW:
      return <Overview {...(props as SectionProps<OverviewSection>)} />;
    case SectionType.SCREENSHOT:
      return <Screenshot {...(props as SectionProps<ScreenshotSection>)} />;
    case SectionType.CARDS:
      return <Cards {...(props as SectionProps<CardsSection>)} />;
    case SectionType.STEPS:
      return <Steps {...(props as SectionProps<StepsSection>)} />;
    case SectionType.BULLETS:
      return <Bullets {...(props as SectionProps<BulletsSection>)} />;
    case SectionType.ORDERED:
      return <Ordered {...(props as SectionProps<OrderedSection>)} />;
    case SectionType.TESTING:
      return <Testing {...(props as SectionProps<TestingSection>)} />;
    default:
      return null;
  }
}
