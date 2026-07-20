import { SymbolPicker } from '@/components/ui';
import { TeamSymbol, TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { useAuth } from '@/lib/auth';
import { t } from '@/i18n';
import {
  TEAM_COLORS,
  TEAM_ISSUE_TYPE_LABEL,
  defaultTeamIcon,
} from '@/types/enums';
import type { TeamDto } from '@/types/dto';
import { useUpdateTeam } from './api';

interface TeamIconPickerProps {
  team: TeamDto;
  /** Icon size in px. */
  size?: number;
  className?: string;
  /** Force the read-only symbol even for someone who could edit (e.g. collapsed nav). */
  readOnly?: boolean;
}

/**
 * A team's symbol and accent, changeable in place. Falls back to a plain symbol
 * for anyone who can't manage teams — matching `@Roles(ADMIN, PRODUCT)` on
 * `PATCH /teams/:id`, so nobody is offered a control that would 403.
 */
export function TeamIconPicker({ team, size = 16, className, readOnly }: TeamIconPickerProps) {
  const { canManageDelivery } = useAuth();
  const update = useUpdateTeam();
  const fallback = defaultTeamIcon(team.issueType);
  const current = team.icon ?? fallback;

  if (readOnly || !canManageDelivery) {
    return (
      <TeamSymbol name={current} size={size} className={className} color={team.color ?? undefined} />
    );
  }

  return (
    <SymbolPicker
      variant="plain"
      value={current}
      color={team.color}
      size={size}
      options={TEAM_SYMBOL_NAMES}
      colors={TEAM_COLORS}
      ariaLabel={t('teams.changeIcon')}
      className={className}
      reset={{
        icon: fallback,
        label: t('teams.useTypeIcon').replace('{type}', TEAM_ISSUE_TYPE_LABEL[team.issueType]),
      }}
      onChange={(patch) => update.mutate({ id: team.id, input: patch })}
    />
  );
}
