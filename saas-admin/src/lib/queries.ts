import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api';
import type {
  CreateTenantPayload,
  FeatureCatalogItem,
  Paginated,
  Plan,
  PlanPayload,
  PlatformOverview,
  Subscription,
  Tenant,
  TenantDetail,
  TenantStatus,
  UpdateTenantPayload,
  UpsertSubscriptionPayload,
} from './types';

/**
 * Every query key in the console, in one place. Anything that changes a tenant
 * can change the overview numbers and the subscriptions table too, so mutations
 * invalidate broadly rather than surgically — this is a low-traffic back office,
 * and a stale MRR figure is worse than an extra request.
 */
export const keys = {
  overview: ['overview'] as const,
  tenants: (params: object) => ['tenants', params] as const,
  tenant: (id: string) => ['tenant', id] as const,
  plans: ['plans'] as const,
  features: ['features'] as const,
  subscriptions: ['subscriptions'] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
    qc.invalidateQueries({ queryKey: ['tenant'] });
    qc.invalidateQueries({ queryKey: ['plans'] });
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
  };
}

// ── Overview ──

export function useOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => apiGet<PlatformOverview>('/platform/tenants/overview'),
  });
}

// ── Tenants ──

export interface TenantQuery {
  search?: string;
  status?: TenantStatus;
  page?: number;
  limit?: number;
}

export function useTenants(params: TenantQuery) {
  return useQuery({
    queryKey: keys.tenants(params),
    queryFn: () => apiGet<Paginated<Tenant>>('/platform/tenants', params),
  });
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: keys.tenant(id ?? ''),
    queryFn: () => apiGet<TenantDetail>(`/platform/tenants/${id}`),
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload: CreateTenantPayload) =>
      apiPost<TenantDetail>('/platform/tenants', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTenant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateTenantPayload & { id: string }) =>
      apiPatch<TenantDetail>(`/platform/tenants/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function useSetTenantStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      apiPatch<Tenant>(
        `/platform/tenants/${id}/${status === 'suspended' ? 'suspend' : 'activate'}`,
      ),
    onSuccess: invalidate,
  });
}

// ── Plans ──

export function usePlans() {
  return useQuery({ queryKey: keys.plans, queryFn: () => apiGet<Plan[]>('/platform/plans') });
}

/** The feature catalog comes from the API so the editor can't drift from it. */
export function useFeatureCatalog() {
  return useQuery({
    queryKey: keys.features,
    queryFn: () => apiGet<FeatureCatalogItem[]>('/platform/plans/features'),
    // The catalog is a code constant on the server; it will not change under us.
    staleTime: Infinity,
  });
}

export function useCreatePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload: PlanPayload) => apiPost<Plan>('/platform/plans', payload),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...payload }: PlanPayload & { id: string }) =>
      apiPatch<Plan>(`/platform/plans/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function useDeletePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/platform/plans/${id}`),
    onSuccess: invalidate,
  });
}

// ── Subscriptions ──

export function useSubscriptions() {
  return useQuery({
    queryKey: keys.subscriptions,
    queryFn: () => apiGet<Subscription[]>('/platform/subscriptions'),
  });
}

export function useUpsertSubscription() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ tenantId, ...payload }: UpsertSubscriptionPayload & { tenantId: string }) =>
      apiPut<Subscription>(`/platform/subscriptions/${tenantId}`, payload),
    onSuccess: invalidate,
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (tenantId: string) =>
      apiPost<Subscription>(`/platform/subscriptions/${tenantId}/cancel`),
    onSuccess: invalidate,
  });
}

export function useRemoveSubscription() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (tenantId: string) => apiDelete<void>(`/platform/subscriptions/${tenantId}`),
    onSuccess: invalidate,
  });
}
