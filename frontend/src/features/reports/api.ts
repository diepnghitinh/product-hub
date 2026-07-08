import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type {
  ProjectStatsDto,
  ReportDto,
  ReportSection,
} from '@/types/dto';
import type { FeatureStatus, TestResult } from '@/types/enums';
import type { RawCase } from './parse-test-cases';

export interface CreateReportInput {
  title: string;
  label?: string;
  groupId?: string;
  statusVariant?: FeatureStatus;
}

export interface UpdateReportInput {
  title?: string;
  label?: string;
  subtitle?: string;
  featureId?: string;
  module?: string;
  owner?: string;
  reported?: string;
  groupId?: string;
  statusVariant?: FeatureStatus;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  totalRows: number;
}

const reportKeys = {
  list: (projectId: string) => ['reports', projectId] as const,
  detail: (projectId: string, id: string) => ['report', projectId, id] as const,
  stats: (ids: string[]) => ['project-stats', ids] as const,
};

export function useReports(projectId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.list(projectId ?? ''),
    queryFn: () => apiGet<ReportDto[]>(`/projects/${projectId}/reports`),
    enabled: !!projectId,
  });
}

export function useReport(projectId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: reportKeys.detail(projectId ?? '', id ?? ''),
    queryFn: () => apiGet<ReportDto>(`/projects/${projectId}/reports/${id}`),
    enabled: !!projectId && !!id,
  });
}

/** Batch report rollups keyed by the sorted id list. */
export function useProjectStats(projectIds: string[]) {
  const ids = [...projectIds].sort();
  return useQuery({
    queryKey: reportKeys.stats(ids),
    queryFn: () =>
      apiGet<ProjectStatsDto[]>('/project-stats', { ids: ids.join(',') }),
    enabled: ids.length > 0,
  });
}

function useReportInvalidation(projectId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['reports', projectId] });
    qc.invalidateQueries({ queryKey: ['report', projectId] });
    qc.invalidateQueries({ queryKey: ['project-stats'] });
  };
}

export function useCreateReport(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: (input: CreateReportInput) =>
      apiPost<ReportDto>(`/projects/${projectId}/reports`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateReport(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReportInput }) =>
      apiPatch<ReportDto>(`/projects/${projectId}/reports/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReplaceSections(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: ({ id, sections }: { id: string; sections: ReportSection[] }) =>
      apiPut<ReportDto>(`/projects/${projectId}/reports/${id}/sections`, { sections }),
    onSuccess: invalidate,
  });
}

export function useReorderReports(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiPost<ReportDto[]>(`/projects/${projectId}/reports/reorder`, { ids }),
    onSuccess: invalidate,
  });
}

export function useDeleteReport(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: true }>(`/projects/${projectId}/reports/${id}`),
    onSuccess: invalidate,
  });
}

export function useImportTestCases(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: ({ id, cases }: { id: string; cases: RawCase[] }) =>
      apiPost<ImportResult>(`/projects/${projectId}/reports/${id}/testcases/import`, {
        cases,
      }),
    onSuccess: invalidate,
  });
}

export function useSetResult(projectId: string) {
  const invalidate = useReportInvalidation(projectId);
  return useMutation({
    mutationFn: ({
      reportId,
      shortId,
      result,
    }: {
      reportId: string;
      shortId: string;
      result: TestResult;
    }) =>
      apiPatch<ReportDto>(
        `/projects/${projectId}/reports/${reportId}/testcases/${shortId}/result`,
        { result },
      ),
    onSuccess: invalidate,
  });
}
