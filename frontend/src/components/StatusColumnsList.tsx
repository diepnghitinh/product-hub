import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  StatusIcon,
  StatusIconTile,
} from '@/components/ui';
import { t } from '@/i18n';
import {
  ISSUE_STATUS_CATEGORIES,
  ISSUE_STATUS_CATEGORY_HINT,
  ISSUE_STATUS_CATEGORY_LABEL,
  IssueStatusCategory,
  STATUS_DESCRIPTION_MAX,
  type TeamStatusConfig,
} from '@/types/enums';

/**
 * The board-columns list, grouped by category — the shape the team settings
 * screen and the personal board's "Manage columns" dialog both render.
 *
 * It's grouped rather than flat because the group is the part with consequences:
 * a column in **Completed** is what burn-up, the "N of M done" counts and the
 * resolved-date stamp all read. A team can call its done column "Released";
 * putting it in Completed is what makes the rest of the app believe it. The
 * hint under each heading says so, so the choice never needs a doc.
 *
 * Everything editable sits behind the row — clicking one opens
 * {@link StatusColumnDialog} — so a board with a dozen columns still reads as a
 * list rather than a wall of inputs. Order within a group is the ↑↓ arrows, the
 * same accessible gesture every other config screen uses; columns can't be
 * dragged between groups because moving one is a change of meaning, not of
 * position.
 */
export interface StatusColumnsListProps {
  rows: TeamStatusConfig[];
  onChange: (rows: TeamStatusConfig[]) => void;
  /** Columns that can't be deleted — a team's shipped ones. Omitted = all removable. */
  builtinKeys?: Set<string>;
  /** Issues currently in each column, keyed by status key. */
  counts?: Record<string, number>;
  /**
   * Take over deletion. The personal board asks where a column's tasks should go
   * before dropping it, so it handles the removal itself; without this the list
   * removes the column (confirming first when it still holds issues).
   */
  onRemoveColumn?: (column: TeamStatusConfig) => void;
  /** Below this many columns, delete is disabled — a board needs at least one. */
  minColumns?: number;
  /** Drop the per-group hint paragraph, for the tighter dialog layout. */
  compact?: boolean;
}

/**
 * One shape for comparing and for saving. Columns come back flattened in
 * category order (that *is* the board's order), and an empty description is
 * dropped rather than stored as `''` — otherwise a board that has never had one
 * would read as edited the moment it loaded.
 */
export function normalizeStatusRows(rows: TeamStatusConfig[]): TeamStatusConfig[] {
  const ordered = ISSUE_STATUS_CATEGORIES.flatMap((c) => rows.filter((r) => r.category === c));
  const placed = new Set(ordered.map((r) => r.key));
  return [...ordered, ...rows.filter((r) => !placed.has(r.key))].map((r) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    category: r.category,
    ...(r.description?.trim() ? { description: r.description.trim() } : {}),
  }));
}

/** "9 issues" — what a column is holding right now. Nothing while the count is
 *  still loading, rather than a misleading 0. */
export function statusCountLabel(count: number | undefined): string | null {
  if (count === undefined) return null;
  if (count === 1) return t('settings.statusIssueCountOne');
  return t('settings.statusIssueCount').replace('{count}', String(count));
}

export function StatusColumnsList({
  rows,
  onChange,
  builtinKeys,
  counts,
  onRemoveColumn,
  minColumns = 1,
  compact = false,
}: StatusColumnsListProps) {
  /** The column open in the edit dialog (`null` = closed). */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** The key `addColumn` just minted — only so the dialog can say "New column"
   *  the first time it opens on it. Cleared when the dialog closes. */
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const isBuiltin = (key: string) => !!builtinKeys?.has(key);

  function update(key: string, patch: Partial<TeamStatusConfig>) {
    onChange(normalizeStatusRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r))));
  }

  /** Swap with the neighbour **in the same group** — rows are kept in category
   *  order, so that neighbour is simply the adjacent row. */
  function move(key: string, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length || rows[j].category !== rows[i].category) return;
    const copy = [...rows];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  }

  function addColumn(category: IssueStatusCategory) {
    // Stable generated slug — the label is editable but the key mustn't change
    // once issues reference it.
    const taken = new Set(rows.map((r) => r.key));
    let n = rows.length + 1;
    while (taken.has(`custom-${n}`)) n += 1;
    const key = `custom-${n}`;
    onChange(
      normalizeStatusRows([
        ...rows,
        { key, label: t('settings.newColumn'), color: '#a855f7', category },
      ]),
    );
    // Straight into the dialog: a column called "New column" is never the answer.
    setEditingKey(key);
    setAddedKey(key);
  }

  function removeColumn(column: TeamStatusConfig) {
    setEditingKey((k) => (k === column.key ? null : k));
    if (onRemoveColumn) return onRemoveColumn(column);
    if ((counts?.[column.key] ?? 0) > 0 && !confirm(t('settings.statusDeleteWithIssues'))) return;
    onChange(rows.filter((r) => r.key !== column.key));
  }

  return (
    <div className="space-y-3">
      {ISSUE_STATUS_CATEGORIES.map((category) => {
        const group = rows.filter((r) => r.category === category);
        return (
          <section key={category} className="overflow-hidden rounded-xl border">
            <header className="flex items-start justify-between gap-3 border-b bg-muted/40 px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <StatusIcon category={category} className="text-muted-foreground" />
                  {ISSUE_STATUS_CATEGORY_LABEL[category]}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {group.length}
                  </span>
                </h4>
                {!compact && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ISSUE_STATUS_CATEGORY_HINT[category]}
                  </p>
                )}
              </div>
              <Button
                className="size-7 shrink-0 text-muted-foreground"
                size="icon"
                variant="ghost"
                type="button"
                aria-label={t('settings.statusAddTo')}
                title={t('settings.statusAddTo')}
                onClick={() => addColumn(category)}
              >
                <Plus />
              </Button>
            </header>
            {group.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground sm:px-4">
                {t('settings.statusGroupEmpty')}
              </p>
            ) : (
              <div className="divide-y">
                {group.map((r, i) => (
                  <StatusColumnRow
                    key={r.key}
                    column={r}
                    count={counts?.[r.key]}
                    builtin={isBuiltin(r.key)}
                    first={i === 0}
                    last={i === group.length - 1}
                    canRemove={rows.length > minColumns}
                    onEdit={() => setEditingKey(r.key)}
                    onMove={(dir) => move(r.key, dir)}
                    onRemove={() => removeColumn(r)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <StatusColumnDialog
        column={rows.find((r) => r.key === editingKey)}
        builtin={!!editingKey && isBuiltin(editingKey)}
        isNew={!!editingKey && editingKey === addedKey}
        count={editingKey ? counts?.[editingKey] : undefined}
        canRemove={rows.length > minColumns}
        onClose={() => {
          setEditingKey(null);
          setAddedKey(null);
        }}
        onChange={(patch) => editingKey && update(editingKey, patch)}
        onRemove={() => {
          const column = rows.find((r) => r.key === editingKey);
          if (column) removeColumn(column);
        }}
      />
    </div>
  );
}

/**
 * One column in the grouped list: its category symbol in its own colour, name,
 * description and how many issues are sitting in it.
 */
function StatusColumnRow({
  column,
  count,
  builtin,
  first,
  last,
  canRemove,
  onEdit,
  onMove,
  onRemove,
}: {
  column: TeamStatusConfig;
  count: number | undefined;
  builtin: boolean;
  first: boolean;
  last: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const issues = statusCountLabel(count);
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <StatusIconTile category={column.category} color={column.color} />
      <button
        type="button"
        className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onEdit}
        aria-label={`${t('settings.editColumn')} — ${column.label}`}
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{column.label}</span>
          {builtin && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t('settings.builtIn')}
            </span>
          )}
        </span>
        {column.description && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {column.description}
          </span>
        )}
      </button>
      {issues && (
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
          {issues}
        </span>
      )}
      {/* Reveal-on-hover from `sm` up, always visible on touch — where there is
          no hover to reveal them with. `focus-within` keeps the keyboard path. */}
      <div className="flex shrink-0 items-center transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button
          type="button"
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          aria-label={t('settings.moveUp')}
          disabled={first}
          onClick={onMove.bind(null, -1)}
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          aria-label={t('settings.moveDown')}
          disabled={last}
          onClick={onMove.bind(null, 1)}
        >
          <ArrowDown className="size-3.5" />
        </button>
        {!builtin && (
          <button
            type="button"
            aria-label={t('common.delete')}
            disabled={!canRemove}
            className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Editing one column. Name, description and colour are cosmetic; the group is
 * not — moving a column into Completed is what makes the rest of the app treat
 * it as finished, so the choice carries its consequence as help text right under
 * the picker.
 *
 * Edits apply straight to the draft (the screen around it owns the one Save), so
 * this dialog has no save of its own — just Done.
 */
function StatusColumnDialog({
  column,
  builtin,
  isNew,
  count,
  canRemove,
  onClose,
  onChange,
  onRemove,
}: {
  /** The column being edited; `undefined` closes the dialog. */
  column: TeamStatusConfig | undefined;
  builtin: boolean;
  /** Opened straight off the group's `+` — titles the dialog "New column". */
  isNew: boolean;
  count: number | undefined;
  canRemove: boolean;
  onClose: () => void;
  onChange: (patch: Partial<TeamStatusConfig>) => void;
  onRemove: () => void;
}) {
  const category = column?.category ?? IssueStatusCategory.UNSTARTED;
  const issues = statusCountLabel(count);
  return (
    <Dialog
      open={!!column}
      onClose={onClose}
      title={isNew ? t('settings.newColumn') : t('settings.editColumn')}
      footer={
        <>
          {!builtin && (
            <Button
              variant="ghost"
              type="button"
              className="mr-auto text-destructive"
              disabled={!canRemove}
              onClick={onRemove}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t('common.delete')}
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {t('common.done')}
          </Button>
        </>
      }
    >
      {column && (
        <>
          <Field label={t('settings.statusLabel')} htmlFor="status-label">
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                value={column.color}
                aria-label={t('settings.statusColor')}
                onChange={(e) => onChange({ color: e.target.value })}
              />
              <Input
                id="status-label"
                className="min-w-0 flex-1"
                value={column.label}
                placeholder={t('settings.statusLabel')}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
          </Field>
          <Field label={t('settings.statusDescription')} htmlFor="status-description">
            <Input
              id="status-description"
              value={column.description ?? ''}
              maxLength={STATUS_DESCRIPTION_MAX}
              placeholder={t('settings.statusDescriptionPlaceholder')}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </Field>
          <Field label={t('settings.statusCategory')} htmlFor="status-category">
            <Select
              id="status-category"
              value={category}
              onValueChange={(v) => onChange({ category: v as IssueStatusCategory })}
              options={ISSUE_STATUS_CATEGORIES.map((c) => ({
                value: c,
                label: (
                  <span className="flex items-center gap-2">
                    <StatusIcon category={c} className="text-muted-foreground" />
                    {ISSUE_STATUS_CATEGORY_LABEL[c]}
                  </span>
                ),
              }))}
            />
            <p className="text-xs text-muted-foreground">{ISSUE_STATUS_CATEGORY_HINT[category]}</p>
          </Field>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{column.key}</span>
            {issues && <span>{issues}</span>}
          </p>
        </>
      )}
    </Dialog>
  );
}
