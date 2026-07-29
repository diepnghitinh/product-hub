import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { t } from '@/i18n';

/**
 * How often a tab that is already open re-checks the server for a new build.
 * On its own the browser only looks for a new service worker on navigation, and
 * this is a SPA people leave open for days — without this poll a deploy would go
 * unnoticed until someone happened to hard-reload.
 */
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

/** Floor between two checks, so returning to the tab repeatedly can't spam the
 *  server with sw.js requests. */
const MIN_CHECK_GAP = 5 * 60 * 1000;

/** A fixed id keeps this to a single toast: re-renders, StrictMode's double
 *  effects and a second deploy all land on the same one instead of stacking. */
const TOAST_ID = 'sw-update';

/**
 * Watches the service worker for a newly deployed build and asks — never tells.
 *
 * The new bundle is already downloaded and waiting by the time the toast shows;
 * "update now" only decides *when* to switch. Declining is safe and cheap: the
 * tab keeps running the build it started with (the old shell is still in the
 * SW's cache) until the next reload.
 *
 * Rendered once, next to <Toaster />, in main.tsx.
 */
export function UpdatePrompt() {
  // `onNeedRefresh` fires from inside registration, before the hook has returned
  // `updateServiceWorker` — so the callback reads it from a ref rather than
  // closing over a value that doesn't exist yet.
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      let lastCheck = Date.now();
      const check = () => {
        // Offline, or an update is already downloading — nothing to ask for.
        if (!navigator.onLine || registration.installing) return;
        if (Date.now() - lastCheck < MIN_CHECK_GAP) return;
        lastCheck = Date.now();
        // A failed check just means "try again next time" — a flaky network
        // must not surface as an error to someone mid-task.
        void registration.update().catch(() => {});
      };

      setInterval(check, UPDATE_CHECK_INTERVAL);
      // Coming back to the tab is the moment a stale build is most likely and
      // most worth catching before more work is typed into it.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },

    onNeedRefresh() {
      toast(t('update.title'), {
        id: TOAST_ID,
        description: t('update.description'),
        icon: <RefreshCw className="size-4 text-primary" aria-hidden />,
        // Stays until it is answered. An update notice that quietly times out
        // is the same as no notice at all.
        duration: Infinity,
        action: {
          label: t('update.reload'),
          // `true` = tell the waiting worker to take over, then reload the tab.
          onClick: () => void updateRef.current?.(true),
        },
        cancel: { label: t('update.later'), onClick: () => toast.dismiss(TOAST_ID) },
      });
    },

    onRegisterError(error) {
      // Registration failing costs nothing at runtime — the app just stops
      // noticing deploys — so it is logged, not shown.
      console.error('[sw] registration failed', error);
    },
  });

  useEffect(() => {
    updateRef.current = updateServiceWorker;
  }, [updateServiceWorker]);

  return null;
}
