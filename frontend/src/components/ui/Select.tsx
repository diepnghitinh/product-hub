import { type ReactNode } from 'react';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from './select-menu';

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

// Radix Select forbids empty-string item values; bridge '' ⇄ sentinel so call
// sites can still model an "all"/"none" option with value="".
const EMPTY = '__empty__';

/**
 * Non-native dropdown — the default select for the app. Built on Radix
 * `SelectMenu`, so the option list is real, stylable DOM (never an OS-native
 * `<select>`) rendered in a portal. Options-based for terse call sites; a
 * `label` may be a node (e.g. a colour dot + text), which Radix mirrors into
 * the trigger. Drop down to `SelectMenu` directly only for grouping.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: SelectProps) {
  return (
    <SelectMenu
      value={value === '' ? EMPTY : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}
      disabled={disabled}
    >
      <SelectMenuTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={className}
      >
        <SelectMenuValue placeholder={placeholder} />
      </SelectMenuTrigger>
      <SelectMenuContent>
        {options.map((o) => (
          <SelectMenuItem
            key={o.value || EMPTY}
            value={o.value === '' ? EMPTY : o.value}
            disabled={o.disabled}
          >
            {o.label}
          </SelectMenuItem>
        ))}
      </SelectMenuContent>
    </SelectMenu>
  );
}
