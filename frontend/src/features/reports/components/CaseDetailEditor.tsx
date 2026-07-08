import { Input, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import type { TestCaseData } from '@/types/dto';

interface CaseDetailEditorProps {
  testCase: TestCaseData;
  canWrite: boolean;
  onChange: (patch: Partial<TestCaseData>) => void;
}

const toLines = (a?: string[]) => (a ?? []).join('\n');
const fromLines = (v: string) =>
  v.split('\n').map((s) => s.trim()).filter(Boolean);

/** The row-expanded detail: precondition, steps, expected, actual, note. */
export function CaseDetailEditor({ testCase: c, canWrite, onChange }: CaseDetailEditorProps) {
  if (!canWrite) {
    const rows: [string, string | undefined][] = [
      [t('report.precondition'), c.precondition],
      [t('report.steps'), c.testSteps?.join(' · ')],
      [t('report.expected'), c.expectedResult],
      [t('report.actual'), c.actualResult],
      [t('report.note'), c.note],
    ];
    const filled = rows.filter(([, v]) => v);
    if (filled.length === 0)
      return <p className="text-xs text-muted-foreground">{t('report.noDetail')}</p>;
    return (
      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        {filled.map(([label, v]) => (
          <div key={label}>
            <dt className="font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t('report.precondition')}</span>
        <Input
          className="h-8"
          defaultValue={c.precondition ?? ''}
          onBlur={(e) =>
            e.target.value !== (c.precondition ?? '') && onChange({ precondition: e.target.value })
          }
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t('report.note')}</span>
        <Input
          className="h-8"
          defaultValue={c.note ?? ''}
          onBlur={(e) => e.target.value !== (c.note ?? '') && onChange({ note: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="font-medium text-muted-foreground">{t('report.steps')}</span>
        <Textarea
          rows={3}
          defaultValue={toLines(c.testSteps)}
          placeholder={t('report.oneLinePerItem')}
          onBlur={(e) => onChange({ testSteps: fromLines(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t('report.expected')}</span>
        <Textarea
          rows={2}
          defaultValue={c.expectedResult ?? ''}
          onBlur={(e) =>
            e.target.value !== (c.expectedResult ?? '') &&
            onChange({ expectedResult: e.target.value })
          }
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">{t('report.actual')}</span>
        <Textarea
          rows={2}
          defaultValue={c.actualResult ?? ''}
          onBlur={(e) =>
            e.target.value !== (c.actualResult ?? '') && onChange({ actualResult: e.target.value })
          }
        />
      </label>
    </div>
  );
}
