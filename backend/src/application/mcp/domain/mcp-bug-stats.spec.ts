import { foldDimension, mergeTrend, trendRange, DIMENSION_CAP } from './mcp-bug-stats';

describe('trendRange', () => {
  // 2026-01-01 là thứ Năm, nên tuần ISO 1 là 29/12/2025–04/01/2026 và 05/01 mở
  // tuần 2. Mốc cuối là thứ Hai 19/01; thứ Hai kế (26/01) đã quá `until`.
  it('sinh liên tiếp các tuần ISO, kể cả tuần không có gì xảy ra', () => {
    const r = trendRange('2026-01-05', '2026-01-25', 'week');
    expect(r).toEqual(['2026-W02', '2026-W03', '2026-W04']);
  });

  it('sinh liên tiếp các tháng, vắt qua năm', () => {
    expect(trendRange('2025-11-10', '2026-01-04', 'month')).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('cùng một ngày → đúng một mốc', () => {
    expect(trendRange('2026-03-03', '2026-03-03', 'week')).toEqual(['2026-W10']);
  });
});

describe('foldDimension', () => {
  const raw = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: `Item ${i}`, count: n - i }));

  it('xếp giảm dần và giữ nguyên khi dưới trần', () => {
    const f = foldDimension('label', raw(3), {});
    expect(f.buckets.map((b) => b.label)).toEqual(['Item 0', 'Item 1', 'Item 2']);
    expect(f.hiddenBuckets).toBe(0);
  });

  it(`cắt ở ${DIMENSION_CAP} và cộng dồn phần bị giấu`, () => {
    const f = foldDimension('label', raw(15), {});
    expect(f.buckets).toHaveLength(DIMENSION_CAP);
    expect(f.hiddenBuckets).toBe(5);
    // 15 mục count 15..1; 10 mục đầu là 15..6, 5 mục giấu là 5+4+3+2+1
    expect(f.hiddenBugs).toBe(15);
  });

  it('ô rỗng luôn xếp cuối và không tính vào trần', () => {
    const rows = [{ key: '', name: '', count: 99 }, ...raw(12)];
    const f = foldDimension('assignee', rows, {});
    expect(f.buckets).toHaveLength(DIMENSION_CAP + 1);
    expect(f.buckets[f.buckets.length - 1]).toEqual({ label: '(unassigned)', count: 99 });
  });

  it('đánh dấu assignee và label là đếm theo lượt gán', () => {
    expect(foldDimension('assignee', raw(2), {}).countsAssignments).toBe(true);
    expect(foldDimension('label', raw(2), {}).countsAssignments).toBe(true);
    expect(foldDimension('status', raw(2), {}).countsAssignments).toBe(false);
  });

  it('tra tên ngoài khi hàng thô chỉ có khoá', () => {
    const f = foldDimension('project', [{ key: 'p1', name: '', count: 4 }], { p1: 'Ads Connect' });
    expect(f.buckets[0].label).toBe('Ads Connect');
  });

  it('không tra được tên thì hiện khoá, không hiện rỗng', () => {
    const f = foldDimension('project', [{ key: 'p9', name: '', count: 1 }], {});
    expect(f.buckets[0].label).toBe('p9');
  });
});

describe('mergeTrend', () => {
  it('ghép opened và closed, mốc thiếu tính là 0, net = opened - closed', () => {
    const out = mergeTrend(
      ['2026-W01', '2026-W02', '2026-W03'],
      [{ bucket: '2026-W01', count: 5 }, { bucket: '2026-W03', count: 2 }],
      [{ bucket: '2026-W03', count: 6 }],
    );
    expect(out).toEqual([
      { bucket: '2026-W01', opened: 5, closed: 0, net: 5 },
      { bucket: '2026-W02', opened: 0, closed: 0, net: 0 },
      { bucket: '2026-W03', opened: 2, closed: 6, net: -4 },
    ]);
  });

  it('bỏ qua mốc nằm ngoài dải đã yêu cầu', () => {
    const out = mergeTrend(['2026-W01'], [{ bucket: '2025-W52', count: 9 }], []);
    expect(out).toEqual([{ bucket: '2026-W01', opened: 0, closed: 0, net: 0 }]);
  });
});
