import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The big frameless heading a record is named in — an issue title, a doc page
 * title. Chrome-less at rest so it reads as the heading it is, and framed in the
 * brand ring while it holds the caret, so "you are editing this" is answered the
 * same way here as in every other writing surface (`.rich-text-editor`).
 *
 * The padding is cancelled by an equal negative margin: the frame gets air
 * around the text without the text moving when it appears. A focus indicator
 * that nudges the heading half a line is worse than none.
 *
 * Call sites add only their own layout (`w-full`, `flex-1`, a larger size at
 * `sm:`) and, for a doc title, `resize-none` — never their own focus style.
 */
export const TITLE_FIELD =
  '-mx-2 -my-1 min-w-0 rounded-md border-0 bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** A leading icon rendered inside the field, left of the text. */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type, icon, ...props }, ref) {
    const input = (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          icon && 'pl-9',
          className,
        )}
        {...props}
      />
    );
    if (!icon) return input;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 grid size-4 -translate-y-1/2 place-items-center text-muted-foreground [&>svg]:size-4">
          {icon}
        </span>
        {input}
      </div>
    );
  },
);
