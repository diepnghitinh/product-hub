import { Badge, type BadgeProps } from '@/components/ui';
import { ENVIRONMENT_LABEL, ProjectEnvironment } from '@/types/enums';

const ENV_VARIANT: Record<ProjectEnvironment, BadgeProps['variant']> = {
  [ProjectEnvironment.DEVELOPMENT]: 'muted',
  [ProjectEnvironment.STAGING]: 'warning',
  [ProjectEnvironment.PRODUCTION]: 'success',
};

export function EnvironmentBadge({ env }: { env: ProjectEnvironment }) {
  return (
    <Badge variant={ENV_VARIANT[env]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {ENVIRONMENT_LABEL[env]}
    </Badge>
  );
}
