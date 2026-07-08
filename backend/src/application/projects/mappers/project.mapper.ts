import { ProjectEntity } from '../domain/entities/project.entity';
import { ProjectResponseDto } from '../dtos/project.response.dto';

/** Report rollup counts for a project. Zeroed until Phase 2 wires reports in. */
export interface ProjectStats {
  reportsTotal: number;
  reportsDone: number;
  reportsTesting: number;
  reportsInfo: number;
}

const ZERO_STATS: ProjectStats = {
  reportsTotal: 0,
  reportsDone: 0,
  reportsTesting: 0,
  reportsInfo: 0,
};

export class ProjectMapper {
  static toResponseDto(
    project: ProjectEntity,
    stats: ProjectStats = ZERO_STATS,
  ): ProjectResponseDto {
    const progress =
      stats.reportsTotal > 0
        ? Math.round((stats.reportsDone / stats.reportsTotal) * 100)
        : 0;

    return {
      id: project.id.toString(),
      tenantId: project.tenantId,
      slug: project.slug,
      title: project.title,
      subtitle: project.subtitle,
      owner: project.owner,
      createdBy: project.createdBy,
      sharedWith: project.sharedWith,
      pinned: project.pinned,
      environment: project.environment,
      publicEnabled: project.publicEnabled,
      publicToken: project.publicToken,
      archived: project.isArchived,
      reportsTotal: stats.reportsTotal,
      reportsDone: stats.reportsDone,
      reportsTesting: stats.reportsTesting,
      reportsInfo: stats.reportsInfo,
      progress,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  static toResponseDtoArray(projects: ProjectEntity[]): ProjectResponseDto[] {
    return projects.map((p) => this.toResponseDto(p));
  }
}
