import { QueryClient } from '@tanstack/react-query';

/**
 * Same posture as the tenant app: nothing is served stale, and refetching is
 * event-driven (focus / reconnect / mount) rather than polled. An operator
 * coming back to the tab after acting in another window should see the effect.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  },
});
