import { ApiProperty } from '@nestjs/swagger';
import { CycleStatus } from '@application/cycles/domain/enums/cycle.enums';

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
