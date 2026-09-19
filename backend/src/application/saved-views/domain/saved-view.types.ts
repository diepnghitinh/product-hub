import { IssueKind } from '@application/issues/domain/enums/issue.enums';

/** Bản chụp trạng thái board issues.
 *
 *  `filters` giữ nguyên hình dạng `FilterSelections` của frontend
 *  (`Record<string, string[]>`) nên không cần lớp ánh xạ nào ở giữa. Một khoảng
 *  ngày được frontend mã hoá thành một chuỗi `"<start>..<end>"` — một khoảng đã
 *  được *giải quyết* (resolved), không phải một preset ("Tuần này", "30 ngày
 *  qua"...). Preset chỉ tồn tại ở UI và được giải quyết thành chuỗi ngày cụ thể
 *  ngay tại thời điểm bấm chọn; nếu lưu lại preset thay vì khoảng ngày đã giải
 *  quyết, saved view sẽ "trôi" — mở lại vào một ngày khác sẽ ngầm định nghĩa lại
 *  một khoảng ngày khác. Xem cảnh báo "filter ngày sẽ đóng băng" ở mục 3.1.1 của
 *  spec. */
export interface SavedViewQuery {
  kind: IssueKind;
  view: 'board' | 'list' | 'timeline' | 'calendar';
  filters: Record<string, string[]>;
  sort: { field: string; dir: 'asc' | 'desc' } | null;
  search: string;
}

export const SAVED_VIEW_SCHEMA_VERSION = 1;
export const SAVED_VIEW_NAME_MAX = 60;
export const SAVED_VIEW_PER_USER_MAX = 50;

/** Board mà view thuộc về, dạng *key* chứ không phải path: `issues`,
 *  `issues-me`, `team:<id>`. Client mới là nơi đổi key thành URL (xem
 *  `saved-views/scope.ts` bên frontend), nên ở đây chỉ chấp nhận đúng hình dạng
 *  đó — không `/`, không `.`, không khoảng trắng, và nhiều nhất một dấu `:` làm
 *  dấu phân cách. Một view shared do một người viết ra nhưng cả workspace mở
 *  được, nên nếu cột này chứa được path thì `//evil.example` sẽ thành href
 *  protocol-relative, tức open redirect núp dưới dạng saved view. */
export const SAVED_VIEW_SCOPE_PATTERN = /^[a-z][a-z0-9-]*(:[A-Za-z0-9_-]+)?$/;
export const SAVED_VIEW_SCOPE_MAX = 80;
