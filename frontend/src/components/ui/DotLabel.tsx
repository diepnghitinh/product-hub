import { type ReactNode } from 'react';

/**
 * Option label with a leading colour dot — for `Select` options that carry a
 * status/severity/difficulty colour. Radix mirrors the selected item's text
 * into the trigger, so the dot shows in the open list *and* the closed picker.
 * The dot is decorative: the label carries the meaning.
 */
export function DotLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
