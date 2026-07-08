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
  pre: 'precondition',
  steps: 'testSteps',
  'test steps': 'testSteps',
  'test step': 'testSteps',
  expected: 'expectedResult',
  expectation: 'expectedResult',
  'expected result': 'expectedResult',
  actual: 'actualResult',
  'actual result': 'actualResult',
  note: 'note',
  notes: 'note',
  comment: 'note',
};

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

function mapRow(row: Record<string, unknown>): RawCase {
  const out: RawCase = {};
  for (const [key, value] of Object.entries(row)) {
    const field = HEADER_ALIASES[key.trim().toLowerCase()];
    if (field && value != null && value !== '') {
      (out as Record<string, unknown>)[field] = String(value);
    }
  }
  return out;
}

function fromArrayRows(rows: unknown[][]): RawCase[] {
  const [header, ...body] = rows;
  const headerLower = (header ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const knownHeader = headerLower.some((h) => HEADER_ALIASES[h]);

  return body
    .filter((r) => r.some((c) => c != null && String(c).trim() !== ''))
    .map((r) => {
      const out: RawCase = {};
      r.forEach((cell, i) => {
        if (cell == null || cell === '') return;
        const field = knownHeader
          ? HEADER_ALIASES[headerLower[i]]
          : FIXED_ORDER[i];
        if (field) (out as Record<string, unknown>)[field] = String(cell);
      });
      return out;
    });
}

/** Parse an uploaded .xlsx or .json file into raw case rows. */
export async function parseTestCasesFile(file: File): Promise<RawCase[]> {
  const isJson = file.name.toLowerCase().endsWith('.json');
  if (isJson) {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows: unknown[] = Array.isArray(data)
      ? data
      : data.cases ?? data.testCases ?? data.rows ?? [data];
    return rows.map((r) => mapRow(r as Record<string, unknown>));
  }

  // Lazy-load the (heavy) xlsx parser only when a spreadsheet is imported.
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  return fromArrayRows(rows as unknown[][]);
}
