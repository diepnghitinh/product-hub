import { CalendarDays, GanttChartSquare } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

/** The two readings of the Timeline tab. `gantt` is the default and stays out of
 *  the URL, like every other default on this board. */
export type TimelineMode = 'gantt' | 'calendar';

/**
 * The Timeline tab's **Gantt | Calendar** switch.
 *
 * Deliberately *not* a sixth tab in the view strip: it isn't another view of the
 * roadmap, it's the same timeline asked a different question — "how do these run
 * against each other?" versus "what is happening on the 14th?" — so it sits
 * inside the tab, at the right of the chart's own legend row, next to
 * Collapse/Expand all.
 *
 * Styled from the same tokens as those controls (a bordered group, the active
 * side lifted with `secondary`), so it introduces no colour of its own.
 */
export function TimelineModeToggle({
  value,
  onChange,
  className,
}: {
  value: TimelineMode;
  onChange: (next: TimelineMode) => void;
  className?: string;
}) {
  const modes = [
    { key: 'gantt' as const, label: t('roadmaps.timelineGantt'), Icon: GanttChartSquare },
    { key: 'calendar' as const, label: t('roadmaps.timelineCalendar'), Icon: CalendarDays },
  ];
  return (
    <div
      className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-card p-0.5', className)}
      role="group"
      aria-label={t('roadmaps.timelineMode')}
    >
      {modes.map(({ key, label, Icon }) => (
        <Button
          key={key}
          type="button"
          variant={value === key ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 gap-1.5 px-2 text-xs"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          <Icon className="size-3.5" aria-hidden />
          {/* The label is what makes the pair readable; on a phone the icons
              carry it and the row stays one line. */}
          <span className="hidden sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </Button>
      ))}
    </div>
  );
}
