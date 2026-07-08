import { Badge, type BadgeProps } from '@/components/ui';
import { BUG_SEVERITY_LABEL, BugSeverity } from '@/types/enums';

/** Severity → shadcn Badge variant (neutral theme, no custom colors). */
const SEVERITY_VARIANT: Record<BugSeverity, BadgeProps['variant']> = {
  [BugSeverity.LOW]: 'muted',
  [BugSeverity.MEDIUM]: 'info',
  [BugSeverity.HIGH]: 'warning',
  [BugSeverity.CRITICAL]: 'destructive',
};

export function SeverityBadge({ severity }: { severity: BugSeverity }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {BUG_SEVERITY_LABEL[severity]}
    </Badge>
  );
}
