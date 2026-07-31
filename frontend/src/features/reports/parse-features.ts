import {
  FIXED_ORDER,
  HEADER_ALIASES,
  caseFromObject,
  isEmptyCase,
  normalizeKey,
  type RawCase,
} from './parse-test-cases';

/** One feature the file asks for, plus the test cases that belong to it. */
export interface ParsedFeature {
  name: string;
  cases: RawCase[];
}

/** How the file was split into features — surfaced in the preview so the split
 *  is never a surprise. */
export type FeatureSource = 'column' | 'sheet' | 'file';

export interface FeatureParseResult {
  features: ParsedFeature[];
  source: FeatureSource;
  /** Rows that named no feature and mapped to no case. */
  skipped: number;
  /** Data rows seen (excludes headers and fully-blank spreadsheet rows). */
  totalRows: number;
}

/** Header cells that name the *feature* a row belongs to. These win over the
 *  case aliases (where `feature`/`name` mean the case's Area), because in this
 *  importer the column is what splits the file. */
const FEATURE_ALIASES = new Set([
  'feature',
  'features',
  'feature name',
  'feature label',
  'module',
  'screen',
  'function',
  'functionality',
  'component',
  'epic',
]);

/** Keys a JSON entry may use for the feature name. */
const JSON_NAME_KEYS = ['feature', 'featureName', 'name', 'label', 'title', 'module'];

/** Keys a JSON entry may use for its nested list of cases. */
const JSON_CASES_KEYS = ['cases', 'testCases', 'rows', 'tests'];

/** `Sheet1`, `sheet 2`, … carry no meaning, so we fall back to the file name. */
const isGenericSheet = (name: string) => /^sheet\s*\d*$/i.test(name.trim());

const fileBaseName = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Imported';

/** Case-insensitive bucket key, so `Login` and `login ` are one feature. */
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Collects features by name, keeping first-seen order and merging repeats
 *  (a feature can reappear further down the sheet, or on another sheet). */
class FeatureBuckets {
  private readonly map = new Map<string, ParsedFeature>();

  ensure(name: string): ParsedFeature {
    const key = nameKey(name);
    let bucket = this.map.get(key);
    if (!bucket) {
      bucket = { name: name.trim(), cases: [] };
      this.map.set(key, bucket);
    }
    return bucket;
  }

  add(name: string, c: RawCase): void {
    this.ensure(name).cases.push(c);
  }

  list(): ParsedFeature[] {
    return [...this.map.values()];
  }
}

/**
 * Resolve a sheet's first row into per-column case fields plus the index of the
 * feature column. Without a recognised header we fall back to the template's
 * positional order — and then there is no feature column to split on.
 */
function readHeader(rows: unknown[][]): {
  body: unknown[][];
  fields: (keyof RawCase | undefined)[];
  featureCol: number;
} {
  const [first, ...rest] = rows;
  const cells = (first ?? []).map(normalizeKey);
  const featureCol = cells.findIndex((h) => FEATURE_ALIASES.has(h));
  const hasHeader = featureCol >= 0 || cells.some((h) => HEADER_ALIASES[h]);
  if (!hasHeader) return { body: rows, fields: FIXED_ORDER, featureCol: -1 };
  return {
    // The feature column names the feature; it must not double as a case field.
    fields: cells.map((h, i) => (i === featureCol ? undefined : HEADER_ALIASES[h])),
    body: rest,
    featureCol,
  };
}

/** Read one spreadsheet sheet into `buckets`, returning the row tallies. */
function readSheet(
  rows: unknown[][],
  fallbackName: string,
  buckets: FeatureBuckets,
): { skipped: number; total: number; splitByColumn: boolean } {
  const { body, fields, featureCol } = readHeader(rows);
  let carried = '';
  let skipped = 0;

  for (const row of body) {
    if (!Array.isArray(row)) continue;
    const named = featureCol >= 0 ? String(row[featureCol] ?? '').trim() : '';
    // Blank feature cells continue the feature above — how merged cells and
    // "name it once, then list its cases" sheets are normally written.
    if (named) carried = named;

    const c: RawCase = {};
    row.forEach((cell, i) => {
      if (cell == null || cell === '') return;
      const field = fields[i];
      if (field) (c as Record<string, unknown>)[field] = String(cell);
    });

    const target = carried || fallbackName;
    if (isEmptyCase(c)) {
      // A row that only names a feature still creates it (an empty shell) — a
      // plain list of feature names is a valid file.
      if (named) buckets.ensure(target);
      else skipped += 1;
    } else {
      buckets.add(target, c);
    }
  }

  return { skipped, total: body.length, splitByColumn: featureCol >= 0 };
}

/** Parse `[{ feature, cases: [...] }]` — features with their cases nested. */
function readNestedJson(
  list: Record<string, unknown>[],
  buckets: FeatureBuckets,
  fallbackName: string,
): { skipped: number; total: number } {
  let skipped = 0;
  let total = 0;

  list.forEach((entry, i) => {
    const rawName = JSON_NAME_KEYS.map((k) => entry[k]).find(
      (v) => typeof v === 'string' && v.trim(),
    ) as string | undefined;
    const name = rawName?.trim() || `${fallbackName} ${i + 1}`;
    const nested = JSON_CASES_KEYS.map((k) => entry[k]).find(Array.isArray) as unknown[];
    buckets.ensure(name);
    for (const row of nested ?? []) {
      total += 1;
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        skipped += 1;
        continue;
      }
      const c = caseFromObject(row as Record<string, unknown>);
      if (isEmptyCase(c)) skipped += 1;
      else buckets.add(name, c);
    }
  });

  return { skipped, total };
}

/** Parse a flat `[{ feature, area, steps… }]` list — one row per case. */
function readFlatJson(
  list: Record<string, unknown>[],
  buckets: FeatureBuckets,
  fallbackName: string,
): { skipped: number; splitByKey: boolean } {
  let skipped = 0;
  let splitByKey = false;

  for (const row of list) {
    // A JSON key wins the same way a header cell does: `feature` names the
    // feature, so it must not also land in the case's Area.
    const entries = Object.entries(row);
    const featureKey = entries.find(([k]) => FEATURE_ALIASES.has(normalizeKey(k)))?.[0];
    const name = featureKey ? String(row[featureKey] ?? '').trim() : '';
    if (name) splitByKey = true;

    const rest = { ...row };
    if (featureKey) delete rest[featureKey];
    const c = caseFromObject(rest);
    const target = name || fallbackName;

    if (isEmptyCase(c)) {
      if (name) buckets.ensure(target);
      else skipped += 1;
    } else {
      buckets.add(target, c);
    }
  }

  return { skipped, splitByKey };
}

/**
 * Parse an uploaded `.xlsx`, `.xls`, `.csv`, or `.json` file into features.
 *
 * Three shapes, tried in order: a **Feature column** splits the rows; otherwise
 * each **sheet** is a feature; otherwise the whole **file** is one feature named
 * after itself. JSON may nest cases under each feature, or repeat a `feature`
 * key on every row.
 */
export async function parseFeaturesFile(file: File): Promise<FeatureParseResult> {
  const fallbackName = fileBaseName(file.name);
  const buckets = new FeatureBuckets();
  const isJson =
    file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

  if (isJson) {
    const data = JSON.parse(await file.text());
    const raw: unknown[] = Array.isArray(data)
      ? data
      : data.features ?? data.cases ?? data.rows ?? [data];
    const list = raw.filter(
      (e): e is Record<string, unknown> => !!e && typeof e === 'object' && !Array.isArray(e),
    );
    const nested = list.some((e) => JSON_CASES_KEYS.some((k) => Array.isArray(e[k])));

    if (nested) {
      const { skipped, total } = readNestedJson(list, buckets, fallbackName);
      return { features: buckets.list(), source: 'column', skipped, totalRows: total };
    }
    const { skipped, splitByKey } = readFlatJson(list, buckets, fallbackName);
    return {
      features: buckets.list(),
      source: splitByKey ? 'column' : 'file',
      skipped: skipped + (raw.length - list.length),
      totalRows: raw.length,
    };
  }

  // Lazy-load the (heavy) xlsx parser only when a spreadsheet is imported.
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetNames = wb.SheetNames.filter((n) => wb.Sheets[n]);
  let skipped = 0;
  let totalRows = 0;
  let splitByColumn = false;

  for (const sheetName of sheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown[][];
    if (rows.length === 0) continue;
    // Without a Feature column the sheet itself is the feature — so a workbook
    // of one-sheet-per-feature imports exactly as it reads.
    const sheetLabel = isGenericSheet(sheetName)
      ? sheetNames.length > 1
        ? `${fallbackName} · ${sheetName}`
        : fallbackName
      : sheetName;
    const tally = readSheet(rows, sheetLabel, buckets);
    skipped += tally.skipped;
    totalRows += tally.total;
    splitByColumn ||= tally.splitByColumn;
  }

  return {
    features: buckets.list(),
    source: splitByColumn ? 'column' : sheetNames.length > 1 ? 'sheet' : 'file',
    skipped,
    totalRows,
  };
}

// ── Downloadable templates ────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  'Feature',
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

const TEMPLATE_FEATURES = [
  {
    feature: 'Login',
    cases: [
      {
        area: 'Valid credentials',
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
        area: 'Wrong password',
        type: 'Functional',
        result: 'Untested',
        owner: '',
        precondition: 'Account exists',
        testSteps: ['Open /login', 'Enter a wrong password', 'Submit'],
        expectedResult: 'Inline error, no redirect',
        actualResult: '',
        note: '',
      },
    ],
  },
  {
    feature: 'Forgot password',
    cases: [
      {
        area: 'Reset link',
        type: 'Functional',
        result: 'Blocked',
        owner: 'Bob',
        precondition: 'Account exists',
        testSteps: ['Click "Forgot password"', 'Enter email', 'Open reset link'],
        expectedResult: 'New password is accepted',
        actualResult: '',
        note: 'Blocked by SMTP setup',
      },
    ],
  },
  {
    // A feature with no rows of its own still imports — as an empty shell.
    feature: 'Sign up',
    cases: [],
  },
];

/** An `.xlsx` starter file: a Feature column in front of the case columns. */
export async function buildFeatureTemplateBlob(): Promise<Blob> {
  const XLSX = await import('xlsx');
  const body = TEMPLATE_FEATURES.flatMap((f) =>
    f.cases.length === 0
      ? [[f.feature, '', '', '', '', '', '', '', '', '']]
      : f.cases.map((c) => [
          f.feature,
          c.area,
          c.type,
          c.result,
          c.owner,
          c.precondition,
          c.testSteps.join('\n'),
          c.expectedResult,
          c.actualResult,
          c.note,
        ]),
  );
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...body]);
  ws['!cols'] = [22, 24, 14, 14, 14, 28, 40, 28, 28, 28].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Features');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** A `.json` starter file: features with their cases nested. */
export function buildFeatureTemplateJson(): Blob {
  return new Blob([JSON.stringify({ features: TEMPLATE_FEATURES }, null, 2)], {
    type: 'application/json',
  });
}
