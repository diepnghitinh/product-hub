import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Textarea } from './Textarea';
import { cn } from '@/lib/utils';

export interface MentionOption {
  id: string;
  name: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** People who can be @-mentioned. */
  options: MentionOption[];
  /** Ids of the people currently @-mentioned in the text. */
  onMentionsChange?: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  'aria-label'?: string;
}

/** The active `@query` immediately before the caret (`@` at start or after
 * whitespace, then non-space chars). Null when the caret isn't in a mention. */
function activeQuery(value: string, caret: number): string | null {
  const before = value.slice(0, caret);
  const m = before.match(/(?:^|\s)@(\S*)$/);
  return m ? m[1] : null;
}

/**
 * Textarea with `@`-mention autocomplete: type `@` and a name to pick a
 * teammate from a dropdown. Reports the mentioned ids via `onMentionsChange`
 * (a person is mentioned while their `@Name` token is present in the text).
 */
export function MentionTextarea({
  value,
  onChange,
  options,
  onMentionsChange,
  placeholder,
  className,
  rows,
  'aria-label': ariaLabel,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // Everyone ever inserted, so mentions can be recomputed from the text alone.
  const insertedRef = useRef<MentionOption[]>([]);

  const filtered = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8);
  }, [options, query]);
  const open = query !== null && filtered.length > 0;

  function emitMentions(text: string) {
    if (!onMentionsChange) return;
    const ids = insertedRef.current
      .filter((m) => text.includes(`@${m.name}`))
      .map((m) => m.id);
    onMentionsChange(Array.from(new Set(ids)));
  }

  function handleChange(text: string, caret: number) {
    onChange(text);
    setQuery(activeQuery(text, caret));
    setActive(0);
    emitMentions(text);
  }

  function pick(opt: MentionOption) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const start = before.lastIndexOf('@');
    if (start < 0) return;
    const next = `${value.slice(0, start)}@${opt.name} ${value.slice(caret)}`;
    if (!insertedRef.current.some((m) => m.id === opt.id)) {
      insertedRef.current = [...insertedRef.current, opt];
    }
    onChange(next);
    setQuery(null);
    emitMentions(next);
    // Restore the caret just past the inserted token.
    const pos = start + opt.name.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery(null);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={className}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setQuery(null)}
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              // onMouseDown (not onClick) so it fires before the textarea blurs.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                aria-hidden
              >
                {o.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
