import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import type { SavedViewDto } from '@/types/dto';
import { IssueKind } from '@/types/enums';
import type { FilterSelections } from '@/components/FilterMenu';
import { isIssueSortField, type IssueSort } from '@/features/issues/useIssueSort';
import type { SavedBoardView } from '@/components/filterParams';

/** The board snapshot sent to `POST`/`PATCH /v1/saved-views` — the nested
 *  shape `CreateSavedViewDto.query` / `UpdateSavedViewDto.query` expects on
 *  the backend, even though the response comes back flat (see `SavedViewDto`
 *  and `SavedViewMapper.toDto`). */
export interface SavedViewQuery {
  kind: IssueKind;
  view: SavedBoardView;
  filters: FilterSelections;
  sort: IssueSort | null;
  search: string;
}

export function useSavedViews() {
  return useQuery({
    queryKey: ['saved-views'],
    queryFn: () => apiGet<SavedViewDto[]>('/saved-views'),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['saved-views'] });
}

export function useCreateSavedView() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      name: string;
      icon?: string;
      shared?: boolean;
      /** Which board this view reopens on — a key, never a path (see `scope.ts`).
       *  Omitted means the workspace Issues board, the backend's own default. */
      scope?: string;
      query: SavedViewQuery;
    }) => apiPost<SavedViewDto>('/saved-views', input),
    onSuccess: invalidate,
  });
}

export function useUpdateSavedView() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; shared?: boolean; query?: SavedViewQuery };
    }) => apiPatch<SavedViewDto>(`/saved-views/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSavedView() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/saved-views/${id}`),
    onSuccess: invalidate,
  });
}

/** Board state → the query object saved/updated. Kept pure and separate from
 *  any component so it can be unit-tested without rendering. */
export function buildSavedViewQuery(state: {
  kind: IssueKind;
  view: SavedBoardView;
  filters: FilterSelections;
  sort: IssueSort | null;
  search: string;
}): SavedViewQuery {
  return {
    kind: state.kind,
    view: state.view,
    filters: state.filters,
    sort: state.sort,
    search: state.search,
  };
}

/** Board state restored from a saved view — always well-formed, whatever the
 *  stored row looked like. */
export interface AppliedSavedView {
  kind: IssueKind;
  view: SavedBoardView;
  filters: FilterSelections;
  sort: IssueSort | null;
  search: string;
}

const VALID_VIEWS = new Set(['board', 'list', 'timeline', 'calendar']);

function isFilterSelections(value: unknown): value is FilterSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
  );
}

function isIssueSort(value: unknown): value is IssueSort {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  // The field is checked against the API's own list, not just `typeof string`:
  // a view saved by an older client can name a field that no longer exists, and
  // applying it would put a `?sort=` in the URL that the API rejects.
  return isIssueSortField(s.field) && (s.dir === 'asc' || s.dir === 'desc');
}

/**
 * A stored saved view's fields, defended field-by-field.
 *
 * `CreateSavedViewDto.query` is validated server-side only as `@IsObject()` —
 * no nested schema check — so a row may predate a filter-shape change or come
 * from an older client. Applying it must never crash or wedge the board: each
 * field that doesn't look right degrades independently to the board's own
 * empty/default state rather than failing the whole apply.
 */
export function sanitizeSavedViewQuery(raw: unknown): AppliedSavedView {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    kind: r.kind === 'bug' ? IssueKind.BUG : IssueKind.TASK,
    view: VALID_VIEWS.has(r.view as string) ? (r.view as SavedBoardView) : 'board',
    filters: isFilterSelections(r.filters) ? r.filters : {},
    sort: isIssueSort(r.sort) ? r.sort : null,
    search: typeof r.search === 'string' ? r.search : '',
  };
}

/** Keep only the filter selections that still point at something real. A team,
 *  project, roadmap item etc. deleted after a view was saved must not blank
 *  the whole board — drop just that filter's stale ids, keep the rest, and let
 *  the caller tell the user something was dropped. `valid` only lists the
 *  categories worth checking (e.g. no set means "not checkable here" — status
 *  ids depend on which board/kind is open); a category missing from `valid` is
 *  passed through untouched. */
export function pruneFilters(
  filters: Record<string, string[]>,
  valid: Record<string, Set<string>>,
): { filters: Record<string, string[]>; dropped: boolean } {
  let dropped = false;
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(filters)) {
    const allowed = valid[key];
    if (!allowed) {
      out[key] = values;
      continue;
    }
    const kept = values.filter((v) => allowed.has(v));
    if (kept.length !== values.length) dropped = true;
    if (kept.length) out[key] = kept;
  }
  return { filters: out, dropped };
}
