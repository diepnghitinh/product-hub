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
  SymbolPicker,
  Input,
  Select,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  TEAM_COLORS,
  TEAM_ISSUE_TYPES,
  TEAM_ISSUE_TYPE_LABEL,
  TeamIssueType,
  defaultTeamIcon,
} from '@/types/enums';
import { TEAM_SYMBOL_NAMES } from '@/components/TeamSymbol';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
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
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  // The create form is revealed from the header's top-right "+ Add team", so the
  // section reads as the team list first; adding is a deliberate second step.
  const [adding, setAdding] = useState(false);
  const newIcon = icon ?? defaultTeamIcon(issueType);

  function addTeam() {
    const value = name.trim();
    if (!value || create.isPending) return;
    create.mutate(
      { name: value, issueType, icon: newIcon, color },
      {
        onSuccess: () => {
          setName('');
          setIcon(null);
          setColor(null);
          setAdding(false);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{t('teams.title')}</CardTitle>
          <CardDescription>{t('teams.hint')}</CardDescription>
        </div>
        <Button
          className="shrink-0"
          size="sm"
          variant={adding ? 'ghost' : 'secondary'}
          onClick={() => {
            // Closing discards a half-filled form so it reopens clean.
            if (adding) {
              setName('');
              setIcon(null);
              setColor(null);
            }
            setAdding((v) => !v);
          }}
        >
          {adding ? (
            t('common.cancel')
          ) : (
            <>
              <Plus className="mr-1.5 size-3.5" />
              {t('teams.add')}
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {adding && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 sm:p-4">
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
              className="min-w-0 flex-1 basis-48"
              value={name}
              placeholder={t('teams.name')}
              autoFocus
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
        )}
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
                <TeamIconPicker
                  team={team}
                  className={cn('size-9 border border-input', team.archived && 'opacity-60')}
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
      </CardContent>
    </Card>
  );
}
