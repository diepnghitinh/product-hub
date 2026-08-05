/**
 * Reading a workbook into rows. This is the one implementation — it runs inside
 * the worker (see `sheets.worker.ts`) and, if a worker can't be started, inline
 * on the main thread as a fallback. Callers use `readWorkbook` from `./index`
 * and never pick.
 */

/** One sheet read as rows-of-cells (SheetJS `header: 1`). */
export interface SheetRows {
  name: string;
  /** Cells stay `unknown`: with `formatted: false` SheetJS hands back numbers,
   *  booleans and `Date`s, not strings. Callers stringify at their own edge. */
  rows: unknown[][];
  /** The sheet had more rows or columns than the caps allowed. */
  truncated: boolean;
}

export interface ReadWorkbookOptions {
  /** Read only the workbook's first sheet. */
  firstSheetOnly?: boolean;
  /** Render cells the way the file formats them — dates as dates, percentages
   *  as percentages — instead of the serial numbers underneath. */
  formatted?: boolean;
  /** Caps applied *before the rows leave the worker*, so a 500-column grid isn't
   *  copied across the postMessage boundary just to be sliced on the far side. */
  maxRows?: number;
  maxCols?: number;
}

export async function readWorkbookRows(
  bytes: ArrayBuffer,
  options: ReadWorkbookOptions = {},
): Promise<SheetRows[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array' });
  const names = options.firstSheetOnly ? wb.SheetNames.slice(0, 1) : wb.SheetNames;
  const { maxRows = Infinity, maxCols = Infinity } = options;

  const out: SheetRows[] = [];
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: !options.formatted,
      defval: '',
      blankrows: false,
    }) as unknown[][];
    const wide = rows.some((r) => r.length > maxCols);
    out.push({
      name,
      rows: rows.slice(0, maxRows).map((r) => (r.length > maxCols ? r.slice(0, maxCols) : r)),
      truncated: rows.length > maxRows || wide,
    });
  }
  return out;
}
