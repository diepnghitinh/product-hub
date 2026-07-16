import { useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

export interface TagInputProps {
  /** Current tags (controlled). */
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Cap the number of tags. */
  maxTags?: number;
  /** Reject case-insensitive duplicates. Default true. */
  dedupe?: boolean;
  'aria-invalid'?: boolean;
}

/**
 * Free-text field that turns each entry into a removable chip. Enter or comma
 * commits the draft; Backspace on an empty field removes the last tag. Styled to
 * match Input, with chips rendered as Badges.
 */
export function TagInput({
  value,
  onChange,
  placeholder = 'Add tag…',
  className,
  disabled,
  id,
  maxTags,
  dedupe = true,
  'aria-invalid': ariaInvalid,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (maxTags && value.length >= maxTags) return;
    if (dedupe && value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
        ariaInvalid && 'border-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {value.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        ref={inputRef}
        value={draft}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(draft)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
