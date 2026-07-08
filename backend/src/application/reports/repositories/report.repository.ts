import { ReportEntity } from '../domain/entities/report.entity';

/** Rollup of report statuses for a project. */
export interface ProjectReportStats {
  projectId: string;
  total: number;
  done: number;
  testing: number;
  info: number;
}

/**
 * Port for report persistence. Reports are always scoped by tenant + project.
 * The whole document (including test cases inside testing sections) is stored on
 * the report, so there is no separate test-case collection.
 */
export abstract class IReportRepository {
  findById: (id: string) => Promise<ReportEntity | null>;
  findByProject: (tenantId: string, projectId: string, groupId?: string) => Promise<ReportEntity[]>;
  findByCaseShortId: (
    tenantId: string,
    projectId: string,
    shortId: string,
  ) => Promise<ReportEntity | null>;
  existsBySlug: (tenantId: string, projectId: string, slug: string) => Promise<boolean>;
  countByProject: (tenantId: string, projectId: string) => Promise<number>;
  statsForProjects: (
    tenantId: string,
    projectIds: string[],
  ) => Promise<ProjectReportStats[]>;
  save: (report: ReportEntity) => Promise<void>;
  update: (report: ReportEntity) => Promise<void>;
  delete: (id: string) => Promise<void>;
}
