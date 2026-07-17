import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** An overlay that owns Escape itself: Radix portals select/popover/dropdown
 * content inside this wrapper, and dialogs carry role="dialog". */
const OVERLAY = '[data-radix-popper-content-wrapper], [role="dialog"]';

/**
 * Escape goes back a step — the keyboard twin of the page's back link.
 *
 * Skipped while a dropdown or dialog is open (Radix already closes those on
 * Escape; navigating away *as well* would be a nasty surprise) and while typing
 * in a field. The overlay check reads the DOM rather than the event, which
 * holds regardless of listener order: React unmounts on a later tick, so the
 * layer is still mounted while this handler runs.
 */
export function useEscapeBack(enabled = true) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector(OVERLAY)) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      navigate(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, navigate]);
}
