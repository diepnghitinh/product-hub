import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from '@/components/ui';
import { t } from '@/i18n';
import { TEST_TYPE_COLOR, TEST_TYPES, TestType } from '@/types/enums';

interface TypeSelectProps {
  value: TestType | '';
  disabled?: boolean;
  onChange: (type: TestType | '') => void;
}

// Radix Select items can't have an empty-string value, so map ''→sentinel.
const NONE = '__none__';
const MUTED = 'hsl(var(--muted-foreground))';

const Dot = ({ color }: { color: string }) => (
  <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
);

/**
 * Colored Type pill with a custom (non-native) dropdown whose options are
 * each tinted by their `TEST_TYPE_COLOR` — so UX/UI/etc. read at a glance.
 */
export function TypeSelect({ value, disabled, onChange }: TypeSelectProps) {
  const color = value ? TEST_TYPE_COLOR[value] : MUTED;
  return (
    <SelectMenu
      value={value || NONE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE ? '' : (v as TestType))}
    >
      <SelectMenuTrigger
        aria-label="Type"
        className="h-8 min-w-[128px] font-semibold disabled:opacity-100"
        style={{
          color,
          borderColor: value ? color : undefined,
          background: value ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
        }}
      >
        <span className="flex items-center gap-1.5">
          <Dot color={color} />
          {value || t('common.none')}
        </span>
      </SelectMenuTrigger>
      <SelectMenuContent>
        <SelectMenuItem value={NONE}>
          <span className="flex items-center gap-2 text-muted-foreground">
            <Dot color={MUTED} /> {t('common.none')}
          </span>
        </SelectMenuItem>
        {TEST_TYPES.map((tt) => (
          <SelectMenuItem key={tt} value={tt}>
            <span
              className="flex items-center gap-2 font-medium"
              style={{ color: TEST_TYPE_COLOR[tt] }}
            >
              <Dot color={TEST_TYPE_COLOR[tt]} /> {tt}
            </span>
          </SelectMenuItem>
        ))}
      </SelectMenuContent>
    </SelectMenu>
  );
}
