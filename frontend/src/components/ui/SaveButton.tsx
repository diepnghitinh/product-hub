import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check } from 'lucide-react';
import { Button, type ButtonProps } from './Button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

type SavePhase = 'idle' | 'saving' | 'saved';

export interface SaveButtonProps extends Omit<ButtonProps, 'onClick' | 'loading'> {
  /**
   * Runs the save and resolves when it succeeds. Return the mutation promise —
   * e.g. `() => save.mutateAsync(payload)` — so the button can flip to its
   * "Saved" confirmation on success and quietly revert if it rejects.
   */
  onSave: () => Promise<unknown>;
  /** The idle label; also shown beside the spinner while saving. */
  children: ReactNode;
  /** How long "Saved" holds before it fades back to the label. Default 3000ms. */
  savedHoldMs?: number;
}

/**
 * The app's one save button. After a successful save it shows a "Saved"
 * confirmation — a success-green check on the button's normal fill — that fades
 * back to the label after ~3s, so every save reads the same everywhere. Errors
 * are surfaced by the mutation itself; the button just drops back to idle.
 */
export const SaveButton = forwardRef<HTMLButtonElement, SaveButtonProps>(
  function SaveButton({ onSave, children, savedHoldMs = 3000, disabled, ...props }, ref) {
    const [phase, setPhase] = useState<SavePhase>('idle');
    const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const alive = useRef(true);

    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        clearTimeout(holdTimer.current);
      };
    }, []);

    const handleClick = useCallback(async () => {
      if (phase === 'saving') return;
      clearTimeout(holdTimer.current);
      setPhase('saving');
      try {
        await onSave();
      } catch {
        // The mutation reports its own error (toast/inline) — just reset.
        if (alive.current) setPhase('idle');
        return;
      }
      if (!alive.current) return;
      setPhase('saved');
      holdTimer.current = setTimeout(() => {
        if (alive.current) setPhase('idle');
      }, savedHoldMs);
    }, [onSave, phase, savedHoldMs]);

    const showSaved = phase === 'saved';

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        loading={phase === 'saving'}
        disabled={disabled}
        {...props}
      >
        {/* Grid stack: both layers share one cell, so the button sizes to the
            wider of the two and the label ↔ "Saved" swap is a clean crossfade
            with no width jump. */}
        <span className="grid">
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-300',
              showSaved ? 'opacity-0' : 'opacity-100',
            )}
          >
            {children}
          </span>
          <span
            aria-hidden={!showSaved}
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-300',
              showSaved ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Check className="size-4 text-success" aria-hidden />
            {t('common.saved')}
          </span>
        </span>
      </Button>
    );
  },
);
