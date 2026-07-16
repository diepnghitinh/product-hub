import { useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import type { GroupDto, ReportDto } from '@/types/dto';
import {
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useUpdateGroup,
} from '@/features/groups/api';
import {
  useCreateReport,
  useDeleteReport,
  useReorderReports,
  useUpdateReport,
} from '@/features/reports/api';

const STORAGE_KEY = 'feature-sidebar-collapsed-groups';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : []);
  } catch {
    return new Set();
  }
}
function writeCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

interface FeatureSidebarProps {
  projectId: string;
  canWrite: boolean;
  isAdmin: boolean;
  reports: ReportDto[];
}

/**
 * The "Feature Summary" navigation sidebar: a pinned summary link, then
 * admin-managed groups with their feature reports nested (status dot + short
 * id), plus New feature / New group affordances. Pixel-ported from old-report.
 */
export function FeatureSidebar({
  projectId,
  canWrite,
  isAdmin,
  reports,
}: FeatureSidebarProps) {
  const { data: groups } = useGroups(projectId);
  const createGroup = useCreateGroup(projectId);
  const updateGroup = useUpdateGroup(projectId);
  const deleteGroup = useDeleteGroup(projectId);
  const createReport = useCreateReport(projectId);
  const updateReport = useUpdateReport(projectId);
  const deleteReport = useDeleteReport(projectId);
  const reorderReports = useReorderReports(projectId);
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  useEffect(() => setCollapsed(readCollapsed()), []);

  // Drag a feature onto another to reorder (and move it into that feature's group).
  const handleDrop = useCallback(
    (targetGroupId: string) => {
      const draggedId = dragId;
      const beforeId = dropId;
      setDragId(null);
      setDropId(null);
      if (!draggedId || draggedId === beforeId) return;
      const dragged = reports.find((r) => r.id === draggedId);
      if (!dragged) return;
      const others = reports.filter((r) => r.id !== draggedId);
      let idx = beforeId ? others.findIndex((r) => r.id === beforeId) : -1;
      if (idx < 0) {
        const groupIdxs = others
          .map((r, i) => (r.groupId === targetGroupId ? i : -1))
          .filter((i) => i >= 0);
        idx = groupIdxs.length ? groupIdxs[groupIdxs.length - 1] + 1 : others.length;
      }
      const next = [
        ...others.slice(0, idx),
        { ...dragged, groupId: targetGroupId },
        ...others.slice(idx),
      ];
      if (dragged.groupId !== targetGroupId) {
        updateReport.mutate({ id: draggedId, input: { groupId: targetGroupId } });
      }
      reorderReports.mutate(next.map((r) => r.id));
    },
    [dragId, dropId, reports, reorderReports, updateReport],
  );

  const base = `/testing/${projectId}`;
  const groupList = groups ?? [];
  const knownGroupIds = new Set(groupList.map((g) => g.id));
  const ungrouped = reports.filter((r) => !knownGroupIds.has(r.groupId));
  const reportsFor = (groupId: string) =>
    reports.filter((r) => r.groupId === groupId);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      writeCollapsed(next);
      return next;
    });
  }, []);

  const addFeature = useCallback(
    (groupId: string, groupTitle: string) => {
      const label = window.prompt(
        `New feature in "${groupTitle}"\n\nEnter the feature label:`,
        '',
      );
      const trimmed = label?.trim();
      if (!trimmed) return;
      createReport.mutate(
        { title: trimmed, label: trimmed, groupId },
        { onSuccess: (r) => navigate(`${base}/reports/${r.id}`) },
      );
    },
    [base, createReport, navigate],
  );

  const addGroup = useCallback(() => {
    const title = window.prompt(
      'New group\n\nEnter the group title (e.g. "1 · General"):',
      '',
    );
    const trimmed = title?.trim();
    if (!trimmed) return;
    createGroup.mutate(trimmed);
  }, [createGroup]);

  const renameGroup = useCallback(
    (g: GroupDto) => {
      const title = window.prompt('Rename group', g.title);
      const trimmed = title?.trim();
      if (!trimmed || trimmed === g.title) return;
      updateGroup.mutate({ id: g.id, title: trimmed });
    },
    [updateGroup],
  );

  const removeGroup = useCallback(
    (g: GroupDto, count: number) => {
      const msg =
        count === 0
          ? `Remove group "${g.title}"?`
          : `Remove group "${g.title}" and its ${count} feature${count === 1 ? '' : 's'}? This cannot be undone.`;
      if (window.confirm(msg)) deleteGroup.mutate(g.id);
    },
    [deleteGroup],
  );

  const removeFeature = useCallback(
    (r: ReportDto) => {
      if (
        window.confirm(
          `Remove "${r.label || r.title}"? This deletes the feature and its report. This cannot be undone.`,
        )
      )
        deleteReport.mutate(r.id);
    },
    [deleteReport],
  );

  const renameFeature = useCallback(
    (r: ReportDto) => {
      const current = r.label || r.title;
      const label = window.prompt('Rename feature', current);
      const trimmed = label?.trim();
      if (!trimmed || trimmed === current) return;
      updateReport.mutate({ id: r.id, input: { label: trimmed } });
    },
    [updateReport],
  );

  function renderItems(list: ReportDto[], groupTitle: string, groupId?: string) {
    return (
      <div className="group-items">
        {list.map((item) => (
          <div key={item.id}>
            {isAdmin && dragId && dropId === item.id && dragId !== item.id && (
              <div className="drop-indicator" aria-hidden />
            )}
            <div
              className={`nav-item-row${dragId === item.id ? ' is-dragging' : ''}`}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDragId(item.id) : undefined}
              onDragEnd={
                isAdmin
                  ? () => {
                      setDragId(null);
                      setDropId(null);
                    }
                  : undefined
              }
              onDragOver={
                isAdmin && dragId
                  ? (e) => {
                      e.preventDefault();
                      if (dropId !== item.id) setDropId(item.id);
                    }
                  : undefined
              }
              onDrop={
                isAdmin
                  ? (e) => {
                      e.preventDefault();
                      handleDrop(item.groupId);
                    }
                  : undefined
              }
            >
              {isAdmin && (
                <span className="drag-handle" aria-hidden title="Drag to reorder">
                  ⋮⋮
                </span>
              )}
              <NavLink
                to={`${base}/reports/${item.id}`}
                draggable={false}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
              <span className="nav-item-main">
                <span className="label">{item.label || item.title}</span>
                {item.featureId && <span className="idx">{item.featureId}</span>}
              </span>
              <span className={`badge-dot ${item.statusVariant}`} />
            </NavLink>
            {isAdmin && (
              <div className="row-actions">
                <button
                  type="button"
                  className="row-action"
                  onClick={() => renameFeature(item)}
                  title="Rename feature"
                  aria-label={`Rename feature "${item.label || item.title}"`}
                >
                  <span aria-hidden>✎</span>
                </button>
                <button
                  type="button"
                  className="row-action row-action-danger"
                  onClick={() => removeFeature(item)}
                  title="Remove feature"
                  aria-label={`Remove feature "${item.label || item.title}"`}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            )}
            </div>
          </div>
        ))}
        {canWrite && groupId && (
          <div className="nav-add-row">
            <button
              type="button"
              className="nav-add"
              onClick={() => addFeature(groupId, groupTitle)}
              title={`Add a new feature to "${groupTitle}"`}
            >
              <span className="nav-add-plus" aria-hidden>
                +
              </span>
              <span>{t('report.newFeature')}</span>
            </button>
            <button
              type="button"
              className="nav-add nav-add-icon"
              onClick={() => addFeature(groupId, groupTitle)}
              title="Add a feature"
              aria-label="Add a feature"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <nav>
          <div className="nav-pinned">
            <NavLink
              to={`${base}/summary`}
              className={({ isActive }) =>
                isActive ? 'nav-pinned-item active' : 'nav-pinned-item'
              }
            >
              <span className="nav-pinned-icon" aria-hidden>
                ◫
              </span>
              <span className="nav-pinned-label">Feature Summary</span>
            </NavLink>
          </div>

          {groupList.map((group) => {
            const items = reportsFor(group.id);
            const isCollapsed = collapsed.has(group.id);
            return (
              <div
                className={`nav-group${isCollapsed ? ' is-collapsed' : ''}`}
                key={group.id}
              >
                <div className="group-row">
                  <button
                    type="button"
                    className="group-title"
                    onClick={() => toggle(group.id)}
                    aria-expanded={!isCollapsed}
                    title={isCollapsed ? `Expand "${group.title}"` : `Collapse "${group.title}"`}
                  >
                    <span className="group-caret" aria-hidden />
                    <span className="group-title-text">{group.title}</span>
                    <span className="group-count">{items.length}</span>
                  </button>
                  {isAdmin && (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => renameGroup(group)}
                        title="Rename group"
                        aria-label={`Rename group "${group.title}"`}
                      >
                        <span aria-hidden>✎</span>
                      </button>
                      <button
                        type="button"
                        className="row-action row-action-danger"
                        onClick={() => removeGroup(group, items.length)}
                        title="Remove group"
                        aria-label={`Remove group "${group.title}"`}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                  )}
                </div>
                {!isCollapsed && renderItems(items, group.title, group.id)}
              </div>
            );
          })}

          {ungrouped.length > 0 && (
            <div className="nav-group">
              <div className="group-row">
                <button type="button" className="group-title" disabled>
                  <span className="group-caret" aria-hidden />
                  <span className="group-title-text">Ungrouped</span>
                  <span className="group-count">{ungrouped.length}</span>
                </button>
              </div>
              {renderItems(ungrouped, 'Ungrouped')}
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              className="nav-add nav-add-group"
              onClick={addGroup}
              title="Add a new group to the sidebar"
            >
              <span className="nav-add-plus" aria-hidden>
                +
              </span>
              <span>{t('groups.new')}</span>
            </button>
          )}
        </nav>
      </div>
    </aside>
  );
}
