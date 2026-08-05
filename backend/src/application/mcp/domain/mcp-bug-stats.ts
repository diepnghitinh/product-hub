/**
 * Phần tính toán của `get_bug_stats` — thuần, không DB, không Nest.
 *
 * Cùng cách chia như `application/cycles/domain/cycle-burndown.ts`: repository
 * chỉ gom nhóm thô, mọi luật về trần, ô rỗng và ghép dòng chảy nằm ở đây, nên
 * test được mà không cần Mongo. Backend này không có test tầng infrastructure.
 */

export type BugStatDimension = 'status' | 'severity' | 'assignee' | 'team' | 'label' | 'project';

export const BUG_STAT_DIMENSIONS: BugStatDimension[] = [
  'status',
  'severity',
  'assignee',
  'team',
  'label',
  'project',
];

/** Mặc định khi trợ lý không nói rõ — hai chiều trả lời được nhiều câu hỏi nhất
 *  mà vẫn gọn. */
export const DEFAULT_DIMENSIONS: BugStatDimension[] = ['status', 'severity'];

/** Số ô tối đa in ra cho một chiều mở. Ô rỗng nằm ngoài trần này. */
export const DIMENSION_CAP = 10;

/** Số mốc thời gian tối đa. Vượt thì báo lỗi chứ không cắt — cắt lặng khiến trợ
 *  lý tưởng đã thấy toàn bộ dữ liệu. */
export const TREND_CAP = 26;

/** Số mốc lấy khi xin `trend` mà không cho khoảng thời gian. Không có mặc định
 *  thì khoảng là toàn bộ lịch sử, chắc chắn vượt {@link TREND_CAP} và tool luôn
 *  hỏng ngay lần gọi đầu. */
export const DEFAULT_TREND_BUCKETS = 12;

/** Chiều mà một bug có thể góp mặt nhiều ô — mảng, nên `$unwind`. Tổng theo
 *  chiều sẽ lớn hơn tổng số bug, và reply phải nói ra điều đó. */
const MULTI_VALUED: BugStatDimension[] = ['assignee', 'label'];

/** Nhãn cho ô rỗng, theo từng chiều. Hiện chứ không lọc bỏ: bỏ đi thì các cột
 *  không cộng về tổng, mà "chưa giao 12 bug" thường là con số đáng lo nhất. */
const EMPTY_LABEL: Record<BugStatDimension, string> = {
  status: '(no status)',
  severity: '(no severity set)',
  assignee: '(unassigned)',
  team: '(no team)',
  label: '(no label)',
  project: '(no project)',
};

export interface RawBucket {
  key: string;
  /** Tên đã denormalized sẵn trên issue (assignee); '' nếu phải tra ngoài. */
  name: string;
  count: number;
}

export interface RawTrendRow {
  bucket: string;
  count: number;
}

export interface RawBugStats {
  total: number;
  dimensions: Partial<Record<BugStatDimension, RawBucket[]>>;
  opened: RawTrendRow[];
  closed: RawTrendRow[];
}

export interface StatBucket {
  label: string;
  count: number;
}

export interface FoldedDimension {
  dimension: BugStatDimension;
  buckets: StatBucket[];
  /** Số ô bị cắt vì vượt trần. */
  hiddenBuckets: number;
  /** Tổng số bug nằm trong phần bị cắt. */
  hiddenBugs: number;
  /** True cho assignee/label — reply phải ghi "đếm theo lượt gán". */
  countsAssignments: boolean;
}

export interface TrendBucket {
  bucket: string;
  opened: number;
  closed: number;
  net: number;
}

/**
 * Dải mốc liên tiếp từ `since` đến `until`, kể cả mốc không có gì xảy ra.
 *
 * Sinh đủ dải là có chủ ý: một tuần bị khuyết đọc như "thiếu dữ liệu", trong khi
 * sự thật là "tuần đó không mở bug nào" — nghĩa hoàn toàn khác.
 *
 * Khoá tuần theo ISO (`2026-W07`), khớp với `%G-W%V` mà `$dateToString` sinh ra.
 */
export function trendRange(since: string, until: string, unit: 'week' | 'month'): string[] {
  const out: string[] = [];
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  const cursor = unit === 'week' ? startOfIsoWeek(start) : startOfMonth(start);

  while (cursor <= end) {
    if (unit === 'week') {
      out.push(isoWeekKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      out.push(monthKey(cursor));
      // An toàn vì startOfMonth luôn đặt ngày về 1 — setUTCMonth trên ngày 31 sẽ
      // trượt sang tháng sau.
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return out;
}

function startOfIsoWeek(d: Date): Date {
  const out = new Date(d);
  // getUTCDay: 0 = CN. ISO coi thứ Hai là đầu tuần, nên CN lùi 6 ngày.
  const shift = (out.getUTCDay() + 6) % 7;
  out.setUTCDate(out.getUTCDate() - shift);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** `2026-W07`. Năm ISO có thể khác năm dương lịch ở đầu/cuối năm. */
function isoWeekKey(monday: Date): string {
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const shift = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - shift + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gấp hàng thô của một chiều thành bảng có trần.
 *
 * `names` là bảng tra ngoài cho chiều mà tên không nằm sẵn trên issue (project).
 * Assignee đã có `name` denormalized nên `names` để rỗng.
 */
export function foldDimension(
  dimension: BugStatDimension,
  raw: RawBucket[],
  names: Record<string, string>,
): FoldedDimension {
  const empties = raw.filter((r) => !r.key);
  const filled = raw.filter((r) => r.key).sort((a, b) => b.count - a.count);

  const kept = filled.slice(0, DIMENSION_CAP);
  const hidden = filled.slice(DIMENSION_CAP);

  const buckets: StatBucket[] = kept.map((r) => ({
    label: r.name || names[r.key] || r.key,
    count: r.count,
  }));

  // Ô rỗng luôn xuống cuối và không tính vào trần: nó không cạnh tranh chỗ với
  // các ô thật, mà lại thường là ô đáng chú ý nhất.
  for (const e of empties) {
    buckets.push({ label: EMPTY_LABEL[dimension], count: e.count });
  }

  return {
    dimension,
    buckets,
    hiddenBuckets: hidden.length,
    hiddenBugs: hidden.reduce((sum, r) => sum + r.count, 0),
    countsAssignments: MULTI_VALUED.includes(dimension),
  };
}

/** Ghép hai nhánh opened/closed vào đúng dải mốc. Mốc ngoài dải bị bỏ. */
export function mergeTrend(
  range: string[],
  opened: RawTrendRow[],
  closed: RawTrendRow[],
): TrendBucket[] {
  const o = new Map(opened.map((r) => [r.bucket, r.count]));
  const c = new Map(closed.map((r) => [r.bucket, r.count]));
  return range.map((bucket) => {
    const op = o.get(bucket) ?? 0;
    const cl = c.get(bucket) ?? 0;
    return { bucket, opened: op, closed: cl, net: op - cl };
  });
}
