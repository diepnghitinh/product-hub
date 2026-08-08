import { useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** Collapsed height for long-form content on a detail page. Also capped against
 *  the viewport below, so the same number doesn't swallow a phone screen. */
const MAX_HEIGHT = 600;

/** Don't collapse for the sake of a line or two — a "Show more" that reveals
 *  30px is pure friction. Only content meaningfully past the cap gets clipped. */
const SLACK = 48;

export interface ShowMoreProps {
  children: ReactNode;
  /** Collapsed height in px (default 600 ≈ 22 lines). The applied cap is
   *  `min(maxHeight, 65vh)` so a short screen keeps the rest of the page. */
  maxHeight?: number;
  className?: string;
}

/**
 * Caps tall content and offers a "Show more" at the end. Content that fits is
 * rendered untouched — no fade, no button, nothing to notice — so this is safe
 * to wrap around a description that's usually two lines and occasionally a spec.
 *
 * It measures rather than counting lines, because what it wraps isn't only
 * prose: a description holds images, tables and mermaid diagrams, all of which
 * arrive after the first paint. A ResizeObserver re-measures as they land.
 *
 * Focus anywhere inside opens it, which is what makes it safe around the
 * always-on `RichTextEditor` that anyone with write access sees: click a line to
 * edit and the box is already full height, so you never type into a clipped
 * view. (While collapsed *and* unfocused the editor's hover gutter — the `+` and
 * settings buttons — is clipped with everything else; the click that would use
 * it expands the box first.)
 */
export function ShowMore({ children, maxHeight = MAX_HEIGHT, className }: ShowMoreProps) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const regionId = useId();

  // Measure only while collapsed — expanded, the box *is* the content and there
  // is nothing to compare. Compare the content's natural height against the
  // height the box was actually given, rather than against `maxHeight`: the cap
  // is a CSS `min()`, so on a short screen the number isn't the whole story.
  // Layout effect, not effect: this runs before paint, so tall content is never
  // shown full height for a frame and then snapped shut.
  useLayoutEffect(() => {
    if (expanded) return;
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const measure = () => setClipped(content.offsetHeight > box.clientHeight + SLACK);
    measure();
    // Descriptions grow after they're painted: images load, a diagram is drawn,
    // the editor takes a keystroke. Re-measure on any of it.
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    ro.observe(box);
    return () => ro.disconnect();
  }, [expanded, maxHeight]);

  function toggle() {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
    // Collapsing pulls the end of a long description up past the top of the
    // viewport; bring the block back rather than leaving the reader below it.
    requestAnimationFrame(() => {
      const el = rootRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
    });
  }

  const collapsed = clipped && !expanded;

  return (
    <div ref={rootRef} className={className}>
      <div
        ref={boxRef}
        id={regionId}
        onFocusCapture={() => setExpanded(true)}
        // Clipping the height clips the width too, and the editor's hover gutter
        // (its `+` and block-settings buttons) hangs ~46px to the *left* of the
        // content — so the box is widened leftwards by more than that and padded
        // back, leaving the content exactly where it was. Left only: growing it
        // rightwards would put a horizontal scrollbar on the page.
        className={cn('relative', collapsed && '-ml-14 overflow-hidden pl-14')}
        style={expanded ? undefined : { maxHeight: `min(${maxHeight}px, 65vh)` }}
      >
        <div ref={contentRef}>{children}</div>
        {collapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background via-background/70 to-background/0"
          />
        )}
      </div>
      {(clipped || expanded) && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={regionId}
            className="mt-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {expanded ? t('common.showLess') : t('common.showMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
