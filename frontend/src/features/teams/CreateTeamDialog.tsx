import { useState } from 'react';
import { Button, Dialog, Input, Label, Select, SymbolPicker } from '@/components/ui';
import { t } from '@/i18n';
import {
  TEAM_COLORS,
  TEAM_ISSUE_TYPES,
  TEAM_ISSUE_TYPE_LABEL,
  TeamIssueType,
  defaultTeamIcon,
} from '@/types/enums';
import { TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { useCreateTeam } from '@/features/teams/api';
import type { TeamDto } from '@/types/dto';

/**
 * Create a team from anywhere — the sidebar's `+` opens this, so a new area can
 * be added without a detour through Settings.
 *
 * A team's issue type is fixed at creation: it decides the board's built-in
 * statuses and can't be switched afterwards, which is why the field is here
 * rather than only in the team's own settings.
 */
export function CreateTeamDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after the team exists — the sidebar uses it to open the new board. */
  onCreated?: (team: TeamDto) => void;
}) {
  const create = useCreateTeam();
  const [name, setName] = useState('');
  const [issueType, setIssueType] = useState<TeamIssueType>(TeamIssueType.TASK);
  // Untouched, the symbol tracks the issue type it owns — same rule as Settings.
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const newIcon = icon ?? defaultTeamIcon(issueType);

  function reset() {
    setName('');
    setIcon(null);
    setColor(null);
    setIssueType(TeamIssueType.TASK);
  }

  function submit() {
    const value = name.trim();
    if (!value || create.isPending) return;
    create.mutate(
      { name: value, issueType, icon: newIcon, color },
      {
        onSuccess: (team) => {
          reset();
          onClose();
          onCreated?.(team);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('teams.add')}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!name.trim()} loading={create.isPending}>
            {t('teams.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-team-name">{t('teams.name')}</Label>
          <div className="flex items-center gap-2">
            <SymbolPicker
              value={newIcon}
              color={color}
              options={TEAM_SYMBOL_NAMES}
              colors={TEAM_COLORS}
              ariaLabel={t('teams.icon')}
              reset={{
                icon: defaultTeamIcon(issueType),
                label: t('teams.useTypeIcon').replace('{type}', TEAM_ISSUE_TYPE_LABEL[issueType]),
              }}
              onChange={(patch) => {
                if (patch.icon !== undefined) setIcon(patch.icon);
                if (patch.color !== undefined) setColor(patch.color);
              }}
            />
            <Input
              id="new-team-name"
              autoFocus
              className="min-w-0 flex-1"
              value={name}
              placeholder={t('teams.name')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-team-type">{t('teams.issueType')}</Label>
          <Select
            value={issueType}
            onValueChange={(v) => setIssueType(v as TeamIssueType)}
            aria-label={t('teams.issueType')}
            options={TEAM_ISSUE_TYPES.map((v) => ({ value: v, label: TEAM_ISSUE_TYPE_LABEL[v] }))}
          />
        </div>
      </div>
    </Dialog>
  );
}
