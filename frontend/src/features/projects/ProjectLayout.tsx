import { useEffect, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { ChevronRight, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { ENVIRONMENT_LABEL } from '@/types/enums';
import { FeatureSidebar } from './components/FeatureSidebar';
import { ShareProjectDialog } from './components/ShareProjectDialog';
import { HistoryDialog } from '@/features/reports/components/HistoryDialog';
import { useArchiveProject, useProject, useUpdateProject } from './api';
import { useReports } from '@/features/reports/api';

/** Width, in characters, for the inline title field — enough to fit the text
 *  without leaving an empty box after a short name or eating the topbar. */
const titleSize = (value: string) => Math.max(8, Math.min(value.length + 1, 48));

/** Trigger a client-side file download. */
function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A ready-to-use prompt for generating an importable feature report with an LLM. */
const EXAMPLE_PROMPT = `You are a senior QA engineer. Produce a **feature report** as JSON for the feature I describe.

Return ONLY valid JSON matching this shape:
{
  "title": "Feature Report: <name>",
  "subtitle": "<one line>",
  "featureId": "F-001",
  "module": "<module/area>",
  "statusVariant": "testing | done | info",
  "sections": [
    { "type": "overview", "title": "1. Overview", "paragraphs": ["..."] },
    { "type": "bullets", "title": "2. Key functions", "items": ["..."] },
    { "type": "steps", "title": "3. How it works", "steps": [{ "num": 1, "name": "...", "desc": "..." }] },
    {
      "type": "testing", "title": "4. Testing status",
      "banner": { "title": "...", "description": "..." },
      "coverage": [{ "label": "Happy path", "percent": 100 }],
      "cases": [
        {
          "shortId": "TC-001", "area": "<what is tested>",
          "type": "Functional | UI | UX | API | Integration | Performance | Security | Regression | Accessibility | Other",
          "result": "Passed | Failed | Blocked | Retest | Skipped | Untested",
          "owner": "<name>",
          "precondition": "...", "testSteps": ["..."],
          "expectedResult": "...", "actualResult": "", "note": ""
        }
      ]
    }
  ]
}

Rules:
- Write thorough, realistic test cases covering happy path, edge cases, and error handling.
- Keep step text imperative and concise. Use "Untested" for new cases.

Feature to document:
<describe your feature here>`;

/**
 * Full-screen project workspace shell: a sticky Topbar (back link, title,
 * environment badge, centered Report/Overview/Roadmap/Bugs tabs, role +
 * save-state + overflow menu + generated/owner meta) above the feature
 * sidebar and the routed content. Pixel-ported from the legacy report app.
 */
export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();

  const { data: project, isLoading, isError } = useProject(projectId);
  const { data: reports } = useReports(projectId);
  const archive = useArchiveProject();
  const update = useUpdateProject();
  const saving = useIsMutating() > 0;

  /**
   * Save a renamed title. Blank or unchanged just snaps the field back rather
   * than writing — the input is uncontrolled, so nothing else would restore it.
   */
  function commitTitle(input: HTMLInputElement) {
    if (!project) return;
    const title = input.value.trim();
    if (!title || title === project.title) {
      input.value = project.title;
      return;
    }
    update.mutate({ id: project.id, input: { title } });
  }

  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (isLoading) {
    return (
      <div className="report-workspace items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (isError || !project) {
    return (
      <div className="report-workspace items-center justify-center">
        <div className="text-center text-sm text-[color:var(--muted)]">
          {t('project.notFound')}{' '}
          <Link to="/testing" className="font-medium underline">
            {t('project.back')}
          </Link>
        </div>
      </div>
    );
  }

  const base = `/testing/${project.id}`;
  const path = location.pathname;
  const onSummary = path.endsWith('/summary');
  const onReport = !onSummary;

  const generated = new Date().toISOString().slice(0, 10);

  return (
    <div className={cn('report-workspace', !collapsed && 'sidebar-open')}>
      <header className="topbar">
        <div className="brand">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/testing" className="breadcrumb-link" title={t('project.back')}>
              {t('nav.projects')}
            </Link>
            <ChevronRight className="breadcrumb-sep" size={14} aria-hidden />
            {/* Stays an h1 either way, so the page keeps its heading. */}
            <h1 className="breadcrumb-current">
              {canWrite ? (
                <input
                  // Remounts when the title changes server-side, which is also
                  // what resets the field after a successful save.
                  key={project.title}
                  className="breadcrumb-input"
                  aria-label={t('projects.rename')}
                  title={t('projects.rename')}
                  defaultValue={project.title}
                  maxLength={160}
                  size={titleSize(project.title)}
                  // Grow with the text as you type, without a re-render.
                  onInput={(e) => {
                    e.currentTarget.size = titleSize(e.currentTarget.value);
                  }}
                  onBlur={(e) => commitTitle(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.currentTarget.value = project.title;
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                project.title
              )}
            </h1>
          </nav>
          <span
            className={`env-badge env-${project.environment}`}
            title={`Environment: ${ENVIRONMENT_LABEL[project.environment]}`}
          >
            {ENVIRONMENT_LABEL[project.environment]}
          </span>
        </div>

        <nav className="topbar-tabs" role="tablist" aria-label="Project view">
          <button
            type="button"
            role="tab"
            aria-selected={onReport}
            className={cn('topbar-tab', onReport && 'is-active')}
            onClick={() => navigate(base)}
          >
            {t('project.report')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onSummary}
            className={cn('topbar-tab', onSummary && 'is-active')}
            onClick={() => navigate(`${base}/summary`)}
          >
            {t('project.overview')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="topbar-tab"
            onClick={() =>
              navigate(
                `/roadmaps?projectId=${project.id}&project=${encodeURIComponent(project.title)}`,
              )
            }
          >
            {t('project.roadmap')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="topbar-tab"
            onClick={() =>
              navigate(
                `/bugs?projectId=${project.id}&project=${encodeURIComponent(project.title)}`,
              )
            }
          >
            {t('project.bugs')}
          </button>
        </nav>

        <div className="topbar-right">
          {user && (
            <span
              className="admin-badge"
              title={`Signed in as ${user.name || 'user'} (${user.role})`}
            >
              {user.role?.toUpperCase()}
            </span>
          )}
          {canWrite && (
            <span
              className="save-indicator"
              title={saving ? 'Saving changes…' : 'All changes saved'}
            >
              {saving ? (
                <>
                  <span className="save-spinner" />
                  Saving…
                </>
              ) : (
                <>
                  <span className="save-check" />
                  Up to date
                </>
              )}
            </span>
          )}

          <div className="topbar-menu" ref={menuRef}>
            <button
              type="button"
              className="topbar-btn ghost topbar-menu-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More actions"
            >
              <span aria-hidden>⋯</span>
              <span className="visually-hidden">More actions</span>
            </button>
            {menuOpen && (
              <div className="topbar-menu-panel" role="menu">
                {canWrite && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setShareOpen(true);
                    }}
                  >
                    <span className="topbar-menu-item-label">
                      {t('share.title')}
                    </span>
                    <span className="topbar-menu-item-hint">
                      Invite members to view
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setHistoryOpen(true);
                  }}
                >
                  <span className="topbar-menu-item-label">
                    {t('project.history')}
                  </span>
                  <span className="topbar-menu-item-hint">
                    Test-case update log
                  </span>
                </button>
                {canWrite && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      downloadFile(
                        `${project.slug || 'project'}.json`,
                        JSON.stringify({ project, reports: reports ?? [] }, null, 2),
                        'application/json',
                      );
                    }}
                  >
                    <span className="topbar-menu-item-label">Export project</span>
                    <span className="topbar-menu-item-hint">Download as JSON</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    downloadFile('feature-report-prompt.md', EXAMPLE_PROMPT, 'text/markdown');
                  }}
                >
                  <span className="topbar-menu-item-label">Download prompt</span>
                  <span className="topbar-menu-item-hint">For Claude / ChatGPT</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    window.print();
                  }}
                >
                  <span className="topbar-menu-item-label">Export PDF</span>
                  <span className="topbar-menu-item-hint">
                    Print dialog → Save as PDF
                  </span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm(t('projects.confirmArchive')))
                        archive.mutate(project.id, {
                          onSuccess: () => navigate('/testing'),
                        });
                    }}
                  >
                    <span className="topbar-menu-item-label">
                      {t('projects.archive')}
                    </span>
                    <span className="topbar-menu-item-hint">
                      Move to archived projects
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="meta">
            Generated {generated} · Owner: {project.owner || '—'}
          </div>

          <button
            type="button"
            className="topbar-btn ghost topbar-close"
            onClick={() => navigate(-1)}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>

      <div className="layout">
        {!collapsed && (
          <FeatureSidebar
            projectId={project.id}
            canWrite={canWrite}
            reports={reports ?? []}
          />
        )}
        <button
          type="button"
          className={cn('sidebar-toggle', collapsed && 'is-collapsed')}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden>{collapsed ? '›' : '‹'}</span>
        </button>
        <main className="content-area">
          <Outlet />
        </main>
      </div>

      {shareOpen && (
        <ShareProjectDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          project={project}
        />
      )}
      {historyOpen && (
        <HistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          projectId={project.id}
        />
      )}
    </div>
  );
}
