import { ReportEntity } from '../domain/entities/report.entity';
import { ReportResponseDto } from '../dtos/report.response.dto';

export class ReportMapper {
  static toResponseDto(report: ReportEntity): ReportResponseDto {
    return {
      id: report.id.toString(),
      tenantId: report.tenantId,
      projectId: report.projectId,
      groupId: report.groupId,
      slug: report.slug,
      title: report.title,
      subtitle: report.subtitle,
      label: report.label,
      featureId: report.featureId,
      module: report.module,
      statusVariant: report.statusVariant,
      owner: report.owner,
      reported: report.reported,
      sections: report.sections,
      order: report.order,
      caseCount: report.caseCount,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  static toResponseDtoArray(reports: ReportEntity[]): ReportResponseDto[] {
    return reports.map((r) => this.toResponseDto(r));
  }
}
