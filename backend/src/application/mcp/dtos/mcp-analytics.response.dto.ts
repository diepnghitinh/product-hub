import { ApiProperty } from '@nestjs/swagger';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';
import { FoldedDimension, TrendBucket } from '../domain/mcp-bug-stats';

/** Một sprint, rút gọn cho trợ lý đọc. Phẳng theo quy ước CLAUDE.md. */
export class McpCycleSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() number: number;
  @ApiProperty({ description: "'' thì hiển thị 'Cycle N'" }) name: string;
  @ApiProperty({ description: 'ISO YYYY-MM-DD' }) startDate: string;
  @ApiProperty({ description: 'ISO YYYY-MM-DD' }) endDate: string;
  @ApiProperty({ enum: CycleStatus }) status: CycleStatus;
  @ApiProperty({ description: 'Mục tiêu sprint; "" khi chưa đặt' }) goal: string;
  @ApiProperty() scopeCount: number;
  @ApiProperty() scopePoints: number;
  @ApiProperty() completedCount: number;
  @ApiProperty() completedPoints: number;
}

/** Velocity: mỗi sprint đã đóng, cộng trung bình và dải dao động. */
export class McpVelocityResponseDto {
  @ApiProperty() teamName: string;
  @ApiProperty({ enum: ['points', 'count'], description: 'Đơn vị team thật sự đo' })
  unit: 'points' | 'count';
  @ApiProperty() average: number;
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() sprintsCounted: number;
  @ApiProperty({
    isArray: true,
    type: Number,
    description: 'Số hiệu sprint không chấm điểm, khi báo theo points — chúng kéo trung bình xuống',
  })
  unpointedSprints: number[];
  @ApiProperty({ type: [McpCycleSummaryDto] }) sprints: McpCycleSummaryDto[];
}

/** Phân bố bug: ảnh chụp theo từng chiều, cộng dòng chảy khi có trend. */
export class McpBugStatsResponseDto {
  @ApiProperty({ description: 'Tổng số bug khớp bộ lọc — mốc để đối chiếu các cột' })
  total: number;
  @ApiProperty({ description: 'Tên team đang lọc; "" nghĩa là cả workspace' })
  teamName: string;
  @ApiProperty({
    description:
      'Khoảng lọc SNAPSHOT (dimensions/total) thật sự áp dụng, YYYY-MM-DD — chính ' +
      'since/until đã truyền vào, "" khi không lọc theo ngày. KHÔNG phải cửa sổ ' +
      'trend mặc định — xin trend không thu hẹp snapshot.',
  })
  since: string;
  @ApiProperty({
    description:
      'Khoảng lọc SNAPSHOT thật sự áp dụng — xem `since`; "" khi không lọc theo ngày',
  })
  until: string;
  @ApiProperty({ description: 'Mỗi chiều đã gấp, đã áp trần' })
  dimensions: FoldedDimension[];
  @ApiProperty({ description: 'Mở/đóng/chênh theo mốc; [] khi không xin trend' })
  trend: TrendBucket[];
  @ApiProperty({ description: "'week' | 'month' | ''" })
  trendUnit: string;
  @ApiProperty({
    description:
      'Khoảng thật sự dùng cho dòng chảy trend (YYYY-MM-DD) — mặc định các mốc gần ' +
      'nhất khi không cho since/until; "" khi không xin trend',
  })
  trendSince: string;
  @ApiProperty({ description: 'Đầu khoảng trend — xem `trendSince`; "" khi không xin trend' })
  trendUntil: string;
}
