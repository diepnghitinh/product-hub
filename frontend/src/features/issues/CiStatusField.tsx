import { ExternalLink, GitBranch } from 'lucide-react';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { GitProviderIcon } from '@/components/GitProviderIcon';
import { GitProvider, PIPELINE_STATE_COLOR, PIPELINE_STATE_LABEL, PipelineState } from '@/types/enums';
import type { IssueDto } from '@/types/dto';
import { PropField, PropValue } from './IssueDetail';

/** Just the CI fields, so this takes a `TaskDto`, a `BugDto` or an `IssueDto` —
 *  all three carry the same five, because the API serves one shape for all. */
type IssueCi = Pick<IssueDto, 'ciStatus' | 'ciUrl' | 'ciProvider' | 'ciBranch' | 'ciUpdatedAt'>;

/**
 * The CI/CD label — the last pipeline that mentioned this issue's ref.
 *
 * Read-only by design: it's written solely by an inbound GitHub/GitLab webhook
 * (Settings → Integrations), so there is nothing here to edit. Renders **only**
 * when a run has actually been reported — an "unknown" row on every issue in a
 * workspace that never connected a repo would be noise, and on a workspace that
 * did it would be indistinguishable from "the build hasn't run yet".
 */
export function CiStatusField({ issue }: { issue: IssueCi }) {
  const state = issue.ciStatus as PipelineState | '';
  if (!state) return null;

  const running = state === PipelineState.RUNNING;
  const color = PIPELINE_STATE_COLOR[state];
  const provider = issue.ciProvider as GitProvider | '';

  const label = (
    <span className="flex min-w-0 items-center gap-2">
      {/* A dot, not a badge: it's the same colour language the board columns and
          test results already speak, and it survives a 130px-wide sidebar cell. */}
      <span
        className="relative grid size-2 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: color }}
      >
        {/* Only a live build pulses — a finished one shouldn't keep drawing the
            eye. `motion-safe` so it stays still for prefers-reduced-motion. */}
        {running && (
          <span
            className="absolute inset-0 rounded-full motion-safe:animate-ping"
            style={{ backgroundColor: color }}
          />
        )}
      </span>
      <span className="min-w-0 truncate font-medium" style={{ color }}>
        {PIPELINE_STATE_LABEL[state]}
      </span>
    </span>
  );

  return (
    <PropField bare label={t('issue.ciStatus')}>
      <PropValue icon={provider ? <GitProviderIcon provider={provider} /> : <GitBranch />}>
        {issue.ciUrl ? (
          <a
            href={issue.ciUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t('issue.ciOpenRun')}
            className="group flex min-w-0 items-center gap-1.5 underline-offset-4 hover:underline"
          >
            {label}
            <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ) : (
          label
        )}
      </PropValue>
      {/* Branch + when, one line under the state — the two things you ask next
          ("which branch?", "is this stale?") without spending another row. */}
      {(issue.ciBranch || issue.ciUpdatedAt) && (
        <div className="flex min-w-0 items-center gap-1.5 truncate pl-3 text-xs text-muted-foreground">
          {issue.ciBranch && (
            // The sidebar is ~260px, so a real branch name always truncates —
            // the title is how you read the rest without leaving the page.
            <span className="min-w-0 truncate font-mono" title={issue.ciBranch}>
              {issue.ciBranch}
            </span>
          )}
          {issue.ciBranch && issue.ciUpdatedAt && <span aria-hidden>·</span>}
          {issue.ciUpdatedAt && <span className="shrink-0">{timeAgo(issue.ciUpdatedAt)}</span>}
        </div>
      )}
    </PropField>
  );
}
