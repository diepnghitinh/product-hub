import { cn } from '@/lib/utils';

/**
 * ClickUp's brand mark, verbatim from Simple Icons (24×24, single path).
 *
 * Inline for the same reasons as {@link GitProviderIcon}: it takes
 * `currentColor` so it inherits whatever row it sits in, and a remote logo would
 * be a third-party request on a settings page.
 */
const PATH =
  'M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 6.363 3.739 2.307 0 4.33-1.166 6.203-3.704L22 18.405C19.298 22.065 15.941 24 12.053 24c-3.875 0-7.257-1.922-10.053-5.561zM12.04 6.15l-6.56 5.66-3.02-3.5L12.055 0l9.543 8.32-3.033 3.48-6.525-5.65z';

/** The ClickUp logo. Sized by the caller (`className`), coloured by inheritance. */
export function ClickUpIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      // Decorative: every place this renders names ClickUp in text beside it.
      aria-hidden="true"
      className={cn('size-4', className)}
    >
      <path d={PATH} />
    </svg>
  );
}
