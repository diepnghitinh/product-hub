import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { PublicProjectView } from '@/types/dto';

/** Public read (no auth) — resolves a project share token. */
export function usePublicProject(token: string | undefined) {
  return useQuery({
    queryKey: ['public-project', token],
    queryFn: () => apiGet<PublicProjectView>(`/public/projects/${token}`),
    enabled: !!token,
    retry: false,
  });
}
