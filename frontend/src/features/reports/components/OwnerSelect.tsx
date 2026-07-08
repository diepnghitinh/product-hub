import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from '@/components/ui';
import { t } from '@/i18n';

interface OwnerSelectProps {
  value: string;
  /** Candidate names: workspace users (admins) + owners already used here. */
  options: string[];
  disabled?: boolean;
  onChange: (owner: string) => void;
}

// Radix Select items can't have an empty-string value, so map ''→sentinel.
const UNASSIGNED = '__unassigned__';

/**
 * People picker (custom, non-native) backing a case's free-string `owner`.
 * Empty = "Unassigned". A legacy value not in the known list is preserved.
 */
export function OwnerSelect({ value, options, disabled, onChange }: OwnerSelectProps) {
  const names = Array.from(new Set(options.filter(Boolean)));
  const known = names.includes(value);
  return (
    <SelectMenu
      value={value || UNASSIGNED}
      disabled={disabled}
      onValueChange={(v) => onChange(v === UNASSIGNED ? '' : v)}
    >
      <SelectMenuTrigger aria-label="Owner" className="h-8 min-w-[150px] disabled:opacity-100">
        <span className={value ? '' : 'text-muted-foreground'}>
          {value || t('report.unassigned')}
        </span>
      </SelectMenuTrigger>
      <SelectMenuContent>
        <SelectMenuItem value={UNASSIGNED}>
          <span className="text-muted-foreground">{t('report.unassigned')}</span>
        </SelectMenuItem>
        {names.map((n) => (
          <SelectMenuItem key={n} value={n}>
            {n}
          </SelectMenuItem>
        ))}
        {value && !known && <SelectMenuItem value={value}>{value}</SelectMenuItem>}
      </SelectMenuContent>
    </SelectMenu>
  );
}
