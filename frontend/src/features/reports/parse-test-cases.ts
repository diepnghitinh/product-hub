/** A raw case row sent to the backend (which normalizes type/result/steps). */
export interface RawCase {
  area?: string;
  type?: string;
  result?: string;
  owner?: string;
  precondition?: string;
  testSteps?: string[] | string;
  expectedResult?: string;
  actualResult?: string;
  note?: string;
}

/** Result of parsing a file: the non-empty rows plus counts for the preview. */
export interface ParseResult {
  cases: RawCase[];
  /** Rows that mapped to nothing (all fields blank). */
  skipped: number;
  /** Data rows seen (excludes the header + fully-blank spreadsheet rows). */
  totalRows: number;
}

const HEADER_ALIASES: Record<string, keyof RawCase> = {
  area: 'area',
  feature: 'area',
  scenario: 'area',
  case: 'area',
  title: 'area',
  name: 'area',
  type: 'type',
  category: 'type',
  result: 'result',
  status: 'result',
  owner: 'owner',
  assignee: 'owner',
  tester: 'owner',
  precondition: 'precondition',
  preconditions: 'precondition',
  'pre condition': 'precondition',
  pre: 'precondition',
  steps: 'testSteps',
  'test steps': 'testSteps',
  'test step': 'testSteps',
  expected: 'expectedResult',
  expectation: 'expectedResult',
  'expected result': 'expectedResult',
  actual: 'actualResult',
  'actual result': 'actualResult',
  outcome: 'actualResult',
  observed: 'actualResult',
  note: 'note',
  notes: 'note',
  comment: 'note',
  comments: 'note',
  remark: 'note',
  remarks: 'note',
  memo: 'note',
};

/** The positional order the template emits — used when a sheet has no header. */
const FIXED_ORDER: (keyof RawCase)[] = [
  'area',
  'type',
  'result',
  'owner',
  'precondition',
  'testSteps',
  'expectedResult',
  'actualResult',
  'note',
];

/** Lowercase a header cell and collapse underscores/whitespace, so `Test_Steps`
 *  and `Expected  Result` both match their aliases. */
function normalizeKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

/** A row counts as empty when every meaningful field is blank (type/result
 *  default server-side, so they don't keep an otherwise-blank row alive —
 *  mirrors the backend's `normalizeCases` emptiness rule). */
function isEmptyCase(c: RawCase): boolean {
  const steps = Array.isArray(c.testSteps) ? c.testSteps.join('') : c.testSteps;
  return !(
    c.area?.trim() ||
    c.owner?.trim() ||
    c.precondition?.trim() ||
    steps?.trim() ||
    c.expectedResult?.trim() ||
    c.actualResult?.trim() ||
    c.note?.trim()
  );
}

/** Map a JSON object to a raw row: prefer our canonical field names, then
 *  gap-fill from header aliases so human-authored files still map. */
function mapObject(row: Record<string, unknown>): RawCase {
  const out: RawCase = {
    area: str(row.area),
    type: str(row.type),
    result: str(row.result),
    owner: str(row.owner),
    precondition: str(row.precondition),
    testSteps: Array.isArray(row.testSteps) ? row.testSteps.map(String) : str(row.testSteps),
    expectedResult: str(row.expectedResult),
    actualResult: str(row.actualResult),
    note: str(row.note),
  };
  for (const [key, value] of Object.entries(row)) {
    const field = HEADER_ALIASES[normalizeKey(key)];
    const current = out[field as keyof RawCase];
    if (field && value != null && value !== '' && (current == null || current === '')) {
      (out as Record<string, unknown>)[field] = String(value);
    }
  }
  return out;
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  return String(v);
}

/** Build cases from spreadsheet rows (array-of-arrays), header-mapped when the
 *  first row is recognised, else positional. */
function fromArrayRows(rows: unknown[][]): { cases: RawCase[]; skipped: number; total: number } {
  const [header, ...body] = rows;
  const headerLower = (header ?? []).map(normalizeKey);
  const knownHeader = headerLower.some((h) => HEADER_ALIASES[h]);
  const dataRows = knownHeader ? body : rows;

  const cases: RawCase[] = [];
  let skipped = 0;
  for (const r of dataRows) {
    if (!Array.isArray(r)) continue;
    const out: RawCase = {};
    r.forEach((cell, i) => {
      if (cell == null || cell === '') return;
      const field = knownHeader ? HEADER_ALIASES[headerLower[i]] : FIXED_ORDER[i];
      if (field) (out as Record<string, unknown>)[field] = String(cell);
    });
    if (isEmptyCase(out)) skipped += 1;
    else cases.push(out);
  }
  return { cases, skipped, total: dataRows.length };
}

/** Parse an uploaded `.xlsx`, `.xls`, `.csv`, or `.json` file into raw rows. */
export async function parseTestCasesFile(file: File): Promise<ParseResult> {
  const isJson =
    file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

  if (isJson) {
    const text = await file.text();
    const data = JSON.parse(text);
    const list: unknown[] = Array.isArray(data)
      ? data
      : data.cases ?? data.testCases ?? data.rows ?? [data];
    const cases: RawCase[] = [];
    let skipped = 0;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        skipped += 1;
        continue;
      }
      const c = mapObject(entry as Record<string, unknown>);
      if (isEmptyCase(c)) skipped += 1;
      else cases.push(c);
    }
    return { cases, skipped, totalRows: list.length };
  }

  // Lazy-load the (heavy) xlsx parser only when a spreadsheet is imported.
  // SheetJS reads .xlsx, .xls, and .csv from the same array buffer.
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { cases: [], skipped: 0, totalRows: 0 };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  const { cases, skipped, total } = fromArrayRows(rows as unknown[][]);
  return { cases, skipped, totalRows: total };
}

// ── Downloadable templates ────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  'Area',
  'Type',
  'Result',
  'Owner',
  'Precondition',
  'Test Steps',
  'Expected Result',
  'Actual Result',
  'Note',
];

const TEMPLATE_ROWS = [
  {
    area: 'Login form',
    type: 'Functional',
    result: 'Passed',
    owner: 'Alice',
    precondition: 'User is logged out',
    testSteps: ['Open /login', 'Enter valid credentials', 'Submit'],
    expectedResult: 'Redirect to dashboard',
    actualResult: 'Redirected to dashboard',
    note: 'Verified on Chrome and Safari',
  },
  {
    area: 'Password reset',
    type: 'Functional',
    result: 'Blocked',
    owner: 'Bob',
    precondition: 'Account exists',
    testSteps: ['Click "Forgot password"', 'Enter email', 'Open reset link'],
    expectedResult: 'New password is accepted',
    actualResult: '',
    note: 'Blocked by SMTP setup',
  },
  {
    area: 'Empty state',
    type: 'UI',
    result: 'Untested',
    owner: '',
    precondition: 'Project has no items',
    testSteps: ['Open the project page'],
    expectedResult: 'Empty placeholder renders',
    actualResult: '',
    note: '',
  },
];

/** An `.xlsx` starter file with the columns the importer reads + example rows. */
export async function buildTemplateBlob(): Promise<Blob> {
  const XLSX = await import('xlsx');
  const body = TEMPLATE_ROWS.map((r) => [
    r.area,
    r.type,
    r.result,
    r.owner,
    r.precondition,
    r.testSteps.join('\n'),
    r.expectedResult,
    r.actualResult,
    r.note,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...body]);
  ws['!cols'] = [24, 14, 14, 14, 28, 40, 28, 28, 28].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Test cases');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** A `.json` starter file mirroring the Excel template (steps as an array). */
export function buildTemplateJson(): Blob {
  return new Blob([JSON.stringify(TEMPLATE_ROWS, null, 2)], {
    type: 'application/json',
  });
}
