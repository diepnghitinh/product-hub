import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterSelections } from './FilterMenu';
import { periodCells, type CalendarRange } from './CalendarView';

/**
 * The board's *narrowing* state — what the Filter menu and the search box hold —
 * carried in the URL instead of component state.
 *
 * Why the URL and not `useState`: a board is a place, and a filtered board is a
 * different place. Held in state, every filter died the moment the page
 * unmounted — open an issue from a filtered board, press Back, and you landed on
 * the unfiltered board with no way to get your list back. It also couldn't be
 * reloaded, bookmarked or pasted to a teammate. `view`, `sort`, `cycle` and
 * `kind` already ride here for exactly these reasons; `filters` and `search`
 * were the two that got left behind.
 *
 * This is also what makes a *saved view* work as a label rather than a cage:
 * `?sv=<id>` names the view a board was opened from, but the raw params beside
 * it are the truth. Tweak one chip and the URL still describes the board
 * exactly — which is both how "Modified / Save / Save as new" can tell there's
 * a change, and how an ad-hoc filter can be shared without saving anything.
 */

/**
 * Namespace for every filter param. Without it a filter category collides with
 * a param that means something else on the same board: `BugsBoardPage` reads
 * `?projectId=` as the *scope* of the whole board (bugs for one project, with
 * its own back link and title) **and** offers `projectId` as a filter category.
 * Sharing one param name would make the filter silently re-scope the page.
 */
export const FILTER_PARAM_PREFIX = 'f.';

/** The search box's param. Named `q` because that's what a URL calls it. */
export const SEARCH_PARAM = 'q';

/** How long typing must pause before the search term is written to the URL. */
const SEARCH_DEBOUNCE_MS = 350;

/** A category id → its param name. */
export function filterParamName(categoryId: string): string {
  return `${FILTER_PARAM_PREFIX}${categoryId}`;
}

/**
 * The filter params out of a URL.
 *
 * Values are **repeated params** (`?f.status=todo&f.status=doing`) rather than
 * one comma-joined value. A status key is team-authored and a date range is
 * stored as `start..end` — neither is guaranteed comma-free, and a separator
 * that can appear inside a value is a bug waiting for the one customer who
 * names a column "Blocked, waiting". `URLSearchParams.getAll` does the
 * splitting natively, so there's no escaping to get wrong.
 *
 * Nothing is validated against a category list here on purpose. A URL outlives
 * the code that wrote it, and the categories a board offers depend on data that
 * hasn't loaded yet (a team's statuses, the workspace's projects) — so an
 * unknown key is passed through rather than dropped. An id that no longer
 * matches anything simply returns no rows, exactly as it does when a saved view
 * carries one; `pruneFilters` is where stale ids get cleaned, with the data in
 * hand to know they're stale.
 */
export function readFilterParams(params: URLSearchParams): FilterSelections {
  const out: FilterSelections = {};
  for (const key of new Set(params.keys())) {
    if (!key.startsWith(FILTER_PARAM_PREFIX)) continue;
    const categoryId = key.slice(FILTER_PARAM_PREFIX.length);
    if (!categoryId) continue;
    // A bare `?f.status=` is someone hand-editing the URL, not a selection.
    const values = params.getAll(key).filter((v) => v !== '');
    if (values.length) out[categoryId] = values;
  }
  return out;
}

/**
 * Write filters into a `URLSearchParams` **in place**, for a caller already
 * building the next query string (applying a saved view sets the filters, the
 * search, the kind, the view and the sort — and react-router builds its next
 * params purely from the object it's handed, so those have to be one write or
 * the last one silently wins; see `buildKindViewParams` in `IssuesPage`).
 *
 * Every existing filter param is cleared first, so this *replaces* the filter
 * state rather than merging into it — an unticked option has to actually leave
 * the URL. Non-filter params are untouched.
 */
export function applyFilterParams(params: URLSearchParams, filters: FilterSelections): void {
  for (const key of new Set(params.keys())) {
    if (key.startsWith(FILTER_PARAM_PREFIX)) params.delete(key);
  }
  for (const [categoryId, values] of Object.entries(filters)) {
    for (const value of values ?? []) params.append(filterParamName(categoryId), value);
  }
}

/** Write the search term in place. An empty term removes the param — the
 *  resting state is a clean URL, like `view=board` and "no sort". */
export function applySearchParam(params: URLSearchParams, search: string): void {
  if (search) params.set(SEARCH_PARAM, search);
  else params.delete(SEARCH_PARAM);
}

/** Which view tab the board is on. Not every board offers every one — the bug
 *  boards add `stability` (a chart, not a list of issues); a board that doesn't
 *  list it in its `view.options` simply never writes it. */
export type BoardView = 'board' | 'list' | 'timeline' | 'calendar' | 'stability';

/**
 * The subset of views a *saved view* can carry.
 *
 * A saved view is a named set of filters, a search term and a sort — so it only
 * makes sense over a view that lists issues. `stability` is a chart with none of
 * those (the bug board even drops the toolbar there), so it's excluded at the
 * type level rather than by remembering not to save it; `savedBoardView` is the
 * one place a board view is narrowed down to a savable one.
 */
export type SavedBoardView = Exclude<BoardView, 'stability'>;

export function savedBoardView(view: BoardView): SavedBoardView {
  return view === 'stability' ? 'board' : view;
}

/** The view switch's param. Board is the default and stays *out* of the URL. */
export const VIEW_PARAM = 'view';

/** Read the picked view. Anything unrecognised — a stale link, a hand-edited
 *  URL — reads as the board, the same degrade-to-default rule the sort and the
 *  filters follow. */
const BOARD_VIEWS: BoardView[] = ['board', 'list', 'timeline', 'calendar', 'stability'];

export function readBoardView(params: URLSearchParams): BoardView {
  const value = params.get(VIEW_PARAM) as BoardView | null;
  return value && value !== 'board' && BOARD_VIEWS.includes(value) ? value : 'board';
}

/** Write the view in place, for a caller building the next query string (a
 *  saved view sets this alongside the filters, the search and the sort). */
export function applyBoardView(params: URLSearchParams, view: BoardView): void {
  if (view === 'board') params.delete(VIEW_PARAM);
  else params.set(VIEW_PARAM, view);
}

/**
 * The view switch's `value`/`onChange` pair, held in the URL.
 *
 * Every board already did this by hand, with the same three-way ternary copied
 * three times. Shared here because a saved view now has to write the view too,
 * and the board that reads it and the hook that writes it must agree on the
 * param — the CLAUDE.md board rule, applied to URL state rather than chrome.
 */
export function useBoardView(): [BoardView, (next: BoardView) => void] {
  const [params, setParams] = useSearchParams();
  const view = readBoardView(params);
  const setView = useCallback(
    (next: BoardView) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          applyBoardView(p, next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [view, setView];
}

/**
 * The calendar's month param, `YYYY-MM`. The current month is the default and
 * stays *out* of the URL, like `view=board` and "no sort".
 *
 * In the URL for the same reason the filters are: a month you paged to is a
 * place. Without it, opening an issue from March and pressing Back dropped you
 * on today — the one month you weren't reading.
 */
export const MONTH_PARAM = 'month';

/** First of the month, in local time — what `CalendarView` takes. */
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** The calendar's range param, and the anchor day a week/day range is read from
 *  (`YYYY-MM-DD`). `month` alone still says which month a month view is on, so a
 *  link written before ranges existed keeps meaning what it meant — and it is
 *  what a year range reads its year off, so zooming out and back in lands you on
 *  the month you left. */
export const CALENDAR_RANGE_PARAM = 'cal';
export const CALENDAR_DAY_PARAM = 'day';

/** The ranges that are a window over days, not a single day — they need no
 *  `day` param, and carrying one would silently pick the day you land on when
 *  you zoom back in. */
const DAYLESS = new Set<CalendarRange>(['year', 'month']);

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Where the calendar is looking: how much of it (`range`) and which day
 * (`anchor`), both in the URL for the same reason the month already was — a
 * week you paged to is a place you can send someone.
 *
 * The two params divide cleanly: `month` is the month on screen (and the month a
 * week/day sits in, so switching back up lands where you were), `day` is the
 * exact day a week or day range is read from. A month range doesn't need a day
 * and doesn't keep one.
 *
 * Anything unparseable degrades to "this month, today" — the same rule the view
 * and the sort follow.
 */
export function useCalendarPeriod(): {
  range: CalendarRange;
  anchor: Date;
  setRange: (next: CalendarRange) => void;
  setAnchor: (next: Date) => void;
} {
  const [params, setParams] = useSearchParams();
  const rawRange = params.get(CALENDAR_RANGE_PARAM) ?? '';
  const range: CalendarRange =
    rawRange === 'year' || rawRange === 'week' || rawRange === 'day' ? rawRange : 'month';
  const rawMonth = params.get(MONTH_PARAM) ?? '';
  const rawDay = params.get(CALENDAR_DAY_PARAM) ?? '';

  // Memoised on the params, not rebuilt per render: `CalendarView` derives its
  // whole grid from this `Date`, and a fresh object every render would redo that
  // work on every keystroke elsewhere on the page.
  const anchor = useMemo(() => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDay);
    if (d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
    const m = /^(\d{4})-(\d{2})$/.exec(rawMonth);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : monthStart(new Date());
  }, [rawDay, rawMonth]);

  /** One writer for both params, so they can never disagree about which month is
   *  on screen. */
  const write = useCallback(
    (nextRange: CalendarRange, nextAnchor: Date) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (nextRange === 'month') p.delete(CALENDAR_RANGE_PARAM);
          else p.set(CALENDAR_RANGE_PARAM, nextRange);
          if (DAYLESS.has(nextRange)) p.delete(CALENDAR_DAY_PARAM);
          else p.set(CALENDAR_DAY_PARAM, isoOf(nextAnchor));
          const first = monthStart(nextAnchor);
          if (first.getTime() === monthStart(new Date()).getTime()) p.delete(MONTH_PARAM);
          else p.set(MONTH_PARAM, `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setAnchor = useCallback((next: Date) => write(range, next), [range, write]);

  const setRange = useCallback(
    (next: CalendarRange) => {
      // Zooming in re-anchors on **today** whenever today is inside the window
      // you're leaving: "Day" on the current month means today, not the 1st, and
      // "Month" from this year means this month. A window you paged away from
      // holds no today, so it keeps its own anchor and zooms into its start.
      const today = new Date();
      const cells = periodCells(range, anchor);
      const stamp = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const holdsToday = stamp >= cells[0].from && stamp <= cells[cells.length - 1].to;
      write(next, holdsToday ? today : anchor);
    },
    [anchor, range, write],
  );

  return { range, anchor, setRange, setAnchor };
}

/**
 * The Filter menu's `value`/`onChange` pair, held in the URL.
 *
 * `replace: true` for the same reason `useIssueSort` uses it: ticking a filter
 * refines the board you're on, it isn't a place you should have to press Back
 * through five times to escape. Back still restores the filters — the board's
 * history entry now carries them, which is the whole point.
 */
export function useFilterParams(): [FilterSelections, (next: FilterSelections) => void] {
  const [params, setParams] = useSearchParams();
  const filters = readFilterParams(params);
  const setFilters = useCallback(
    (next: FilterSelections) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          applyFilterParams(p, next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [filters, setFilters];
}

/**
 * The search box's `value`/`onChange` pair, held in the URL — but only after
 * typing pauses.
 *
 * The input stays on local state so it never lags a keystroke, and the URL is
 * written once the user stops. That debounce isn't a nicety: a `replaceState`
 * per character is throttled by the browser (Safari drops calls past ~100 in
 * 30s and logs a security error), so a fast typist could lose the very state
 * this hook exists to keep.
 *
 * The URL is still the source of truth. When it changes for a reason other than
 * this hook's own write — Back, or a saved view being applied — the input
 * adopts it; `pushed` is what tells the two apart, so an in-flight keystroke is
 * never yanked out from under the user by the value they just replaced.
 */
export function useSearchParam(): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const urlTerm = params.get(SEARCH_PARAM) ?? '';
  const [term, setTerm] = useState(urlTerm);
  /** The last term this hook and the URL agreed on. */
  const pushed = useRef(urlTerm);

  useEffect(() => {
    if (urlTerm === pushed.current) return;
    pushed.current = urlTerm;
    setTerm(urlTerm);
  }, [urlTerm]);

  useEffect(() => {
    if (term === pushed.current) return;
    const id = setTimeout(() => {
      pushed.current = term;
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          applySearchParam(p, term);
          return p;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term, setParams]);

  return [term, setTerm];
}
