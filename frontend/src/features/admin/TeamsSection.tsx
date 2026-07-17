import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconSelect,
  Input,
  Select,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  TEAM_ICONS,
  TEAM_ISSUE_TYPES,
  TEAM_ISSUE_TYPE_LABEL,
  TeamIcon,
  TeamIssueType,
  defaultTeamIcon,
} from '@/types/enums';
import { useCreateTeam, useTeams, useUpdateTeam } from '@/features/teams/api';

/**
 * Manage the workspace's teams. QC + Engineering are seeded and can be renamed
 * but not archived (the backend enforces it); custom teams can be archived,
 * which keeps their issues but drops them from the sidebar.
 */
export function TeamsSection() {
  const { data: teams, isLoading } = useTeams();
  const create = useCreateTeam();
  const update = useUpdateTeam();

  const [name, setName] = useState('');
  const [issueType, setIssueType] = useState<TeamIssueType>(TeamIssueType.TASK);
  // Untouched, the new team's symbol tracks the issue type it owns.
  const [icon, setIcon] = useState<TeamIcon | null>(null);
  const newIcon = icon ?? defaultTeamIcon(issueType);

  function addTeam() {
    const value = name.trim();
    if (!value || create.isPending) return;
    create.mutate(
      { name: value, issueType, icon: newIcon },
      {
        onSuccess: () => {
          setName('');
          setIcon(null);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teams.title')}</CardTitle>
        <CardDescription>{t('teams.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {(teams ?? []).map((team) => (
              <div
                key={team.id}
                className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:px-4"
              >
                <IconSelect
                  value={team.icon ?? defaultTeamIcon(team.issueType)}
                  options={TEAM_ICONS}
                  ariaLabel={t('teams.icon')}
                  className={cn(team.archived && 'opacity-60')}
                  onChange={(next) =>
                    update.mutate({ id: team.id, input: { icon: next as TeamIcon } })
                  }
                />
                <Input
                  className={cn('min-w-0 flex-1 sm:max-w-xs', team.archived && 'opacity-60')}
                  defaultValue={team.name}
                  aria-label={t('teams.name')}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== team.name) update.mutate({ id: team.id, input: { name: next } });
                  }}
                />
                <Badge variant="muted" className="shrink-0">
                  {TEAM_ISSUE_TYPE_LABEL[team.issueType]}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{team.key}</span>
                {team.archived && (
                  <Badge variant="secondary" className="shrink-0">
                    {t('teams.archived')}
                  </Badge>
                )}
                <div className="ml-auto">
                  {team.isDefault ? (
                    // The seeded teams own the bug/task lists — archiving one
                    // would strand them, so the backend refuses it too.
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t('settings.builtIn')}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (team.archived) {
                          update.mutate({ id: team.id, input: { archived: false } });
                        } else if (confirm(t('teams.confirmArchive'))) {
                          update.mutate({ id: team.id, input: { archived: true } });
                        }
                      }}
                    >
                      {team.archived ? t('teams.unarchive') : t('teams.archive')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <IconSelect
            value={newIcon}
            options={TEAM_ICONS}
            ariaLabel={t('teams.icon')}
            onChange={(next) => setIcon(next as TeamIcon)}
          />
          <Input
            className="min-w-0 flex-1 basis-48"
            value={name}
            placeholder={t('teams.name')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeam()}
          />
          <div className="w-40">
            <Select
              value={issueType}
              onValueChange={(v) => setIssueType(v as TeamIssueType)}
              aria-label={t('teams.issueType')}
              options={TEAM_ISSUE_TYPES.map((v) => ({
                value: v,
                label: TEAM_ISSUE_TYPE_LABEL[v],
              }))}
            />
          </div>
          <Button onClick={addTeam} disabled={!name.trim()} loading={create.isPending}>
            <Plus className="mr-1.5 size-3.5" />
            {t('teams.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
