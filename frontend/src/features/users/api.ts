import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import type { ListResponse, UserDto } from '@/types/dto';
import type { Role } from '@/types/enums';

/**
 * Canonical query-hook pattern. Admin-only endpoints — pass `enabled: false`
 * for non-admins so the list isn't fetched.
 */
export function useUsers(
  params?: { page?: number; limit?: number; search?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => apiGet<ListResponse<UserDto>>('/users', params),
    enabled,
  });
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => apiPost<UserDto>('/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; role?: Role } }) =>
      apiPatch<UserDto>(`/users/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/**
 * Admin resets another user's password directly (no email flow exists). The new
 * password isn't cached anywhere, so there's nothing to invalidate — `@Roles(ADMIN)`
 * on `PATCH /users/:id/password` is the gate.
 */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiPatch<{ ok: true }>(`/users/${id}/password`, { newPassword }),
  });
}

/** The current user changes their own password (verifies the current one). */
export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiPut<{ ok: true }>('/users/me/password', input),
  });
}
