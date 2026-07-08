import {
  Ban,
  CheckCircle2,
  CircleDashed,
  MinusCircle,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from '@/components/ui';
import { TEST_RESULT_COLOR, TEST_RESULTS, TestResult } from '@/types/enums';

interface ResultSelectProps {
  value: TestResult;
  disabled?: boolean;
  onChange: (result: TestResult) => void;
}

/** Status icon per result — shown in the pill and in each colored option. */
const RESULT_ICON: Record<TestResult, LucideIcon> = {
  [TestResult.PASSED]: CheckCircle2,
  [TestResult.FAILED]: XCircle,
  [TestResult.BLOCKED]: Ban,
  [TestResult.RETEST]: RotateCcw,
  [TestResult.SKIPPED]: MinusCircle,
  [TestResult.UNTESTED]: CircleDashed,
};

/**
 * Colored result pill (icon + label) with a custom (non-native) dropdown; each
 * option is tinted and icon-badged by its `TEST_RESULT_COLOR`.
 */
export function ResultSelect({ value, disabled, onChange }: ResultSelectProps) {
  const color = TEST_RESULT_COLOR[value];
  const Icon = RESULT_ICON[value];
  return (
    <SelectMenu
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as TestResult)}
    >
      <SelectMenuTrigger
        aria-label="Result"
        className="h-8 min-w-[132px] disabled:opacity-100"
        style={{
          color,
          borderColor: color,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
        }}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" style={{ color }} />
          {value}
        </span>
      </SelectMenuTrigger>
      <SelectMenuContent>
        {TEST_RESULTS.map((r) => {
          const RIcon = RESULT_ICON[r];
          return (
            <SelectMenuItem key={r} value={r}>
              <span
                className="flex items-center gap-2 font-medium"
                style={{ color: TEST_RESULT_COLOR[r] }}
              >
                <RIcon className="size-3.5 shrink-0" /> {r}
              </span>
            </SelectMenuItem>
          );
        })}
      </SelectMenuContent>
    </SelectMenu>
  );
}
