import { QueryClient } from '@tanstack/react-query';

/**
 * How the whole app fetches.
 *
 * **Nothing is served stale.** `staleTime: 0` marks data stale the moment it
 * lands, so each of the triggers below causes a real request rather than a cache
 * hit. The rows you already have still paint instantly — react-query keeps the
 * previous data on screen while the refetch runs and swaps it when the new data
 * arrives — so this buys freshness without turning every navigation into a
 * loading skeleton.
 *
 * **What used to happen.** `staleTime: 30_000` with `refetchOnWindowFocus: false`
 * meant a list that stayed mounted *never* refetched while you were away from the
 * tab: you could sit on a board for an hour reading what a teammate had already
 * changed, and only your own edits would move it. The 30s window also made the
 * first render after navigating back a coin toss between fresh and stale.
 *
 * **Refetching is event-driven, not timed.** No polling here — the three
 * triggers are *coming back to the tab*, *reconnecting*, and *arriving on the
 * page*, which is when data could have changed behind you and when you're
 * actually looking. Each one only refetches queries that are **mounted** and
 * stale, so an idle tab and unopened pages cost nothing. (The inbox keeps its own
 * `refetchInterval` — the topbar badge has to move while you're on another page,
 * where no event will fire.)
 *
 * A query whose cache is *owned by the UI* rather than mirroring the server must
 * opt out, or a background refetch will pull the ground out from under it — see
 * `useDocPage`, which the editor and the collab session read from.
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
