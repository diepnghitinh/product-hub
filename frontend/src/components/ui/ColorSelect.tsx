import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColorOption {
  value: string;
  label: string;
  /** Any CSS colour for the swatch + label, e.g. 'hsl(262 60% 58%)' or '#16a34a'. */
  color: string;
}

export interface ColorSelectProps {
  value: string;
  options: ColorOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
}

/**
 * A colour-coded select: the trigger is a tinted chip in the selected option's
 * colour, and the open menu lists every option with a colour dot + coloured
 * label — so the colours are visible in the open picker on **every** browser
 * (native `<option>` colours are ignored by Safari). Theme-aware via the shadcn
 * tokens. The menu is fixed-positioned so it escapes clipping ancestors.
 */
export function ColorSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  placeholder = '—',
}: ColorSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Close on page scroll, but not when scrolling inside the (fixed) menu itself.
    const onScroll = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? null;
  const triggerStyle: CSSProperties | undefined = current
    ? {
        color: current.color,
        borderColor: current.color,
        background: `color-mix(in srgb, ${current.color} 12%, transparent)`,
      }
    : undefined;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      // Prefer opening downward; flip up when there isn't room below and there's more above.
      const desired = Math.min(256, options.length * 34 + 8);
      const flipUp = spaceBelow < desired && spaceAbove > spaceBelow;
      setMenuStyle({
        left: r.left,
        minWidth: r.width,
        maxHeight: Math.min(256, Math.max(0, flipUp ? spaceAbove : spaceBelow)),
        ...(flipUp
          ? { bottom: window.innerHeight - r.top + gap }
          : { top: r.bottom + gap }),
      });
    }
    setOpen(true);
  };

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        style={triggerStyle}
        className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
      {open && menuStyle && (
        <div
          role="listbox"
          className="fixed z-50 flex flex-col gap-0.5 overflow-y-auto rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md"
          style={menuStyle}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={{ color: o.color }}
              className={cn(
                'flex w-full items-center gap-2 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-accent',
                o.value === value && 'bg-accent',
              )}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
