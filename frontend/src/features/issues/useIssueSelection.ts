import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select state for a list of issues, keyed by id. Deliberately unaware of
 * how the rows are grouped or rendered — the List view drives it (a row checkbox
 * calls {@link set}, a column header calls {@link setMany} for its rows) and the
 * bulk toolbar reads {@link ids}. Selection is a plain id Set, so it survives
 * re-renders and spans status columns.
 */
export interface IssueSelection {
  /** Selected ids, in no particular order. */
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  /** Flip one row. */
  toggle: (id: string) => void;
  /** Force one row on/off (from a controlled checkbox). */
  set: (id: string, on: boolean) => void;
  /** Force a batch on/off — a column header's "select all in column". */
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
}

export function useIssueSelection(): IssueSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const set = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      if (on === prev.has(id)) return prev;
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected((prev) => (prev.size ? new Set() : prev)), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return useMemo(
    () => ({ ids: [...selected], count: selected.size, isSelected, toggle, set, setMany, clear }),
    [selected, isSelected, toggle, set, setMany, clear],
  );
}
