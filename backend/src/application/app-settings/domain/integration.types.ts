/**
 * Git integrations — GitHub / GitLab telling us when an issue's pipeline runs.
 *
 * Deliberately **inbound only**. We hand out a URL and a secret; the repo posts
 * to it. Nothing here stores an access token and nothing calls out to a git
 * host, which is what keeps the blast radius of this feature to "someone could
 * post us a fake build status" rather than "someone could read your source".
 */

/** Git hosts that can deliver a pipeline event. */
export enum GitProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
}

export const GIT_PROVIDERS: GitProvider[] = [GitProvider.GITHUB, GitProvider.GITLAB];

/**
 * The CI/CD state shown as a label on an issue. Four states, not the dozen each
 * provider actually emits: everything queued/pending/preparing reads as RUNNING,
 * and states that never ran (skipped, manual) don't produce a label at all —
 * a label that says "skipped" tells you nothing you wanted to know.
 */
export enum PipelineState {
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export const PIPELINE_STATES: PipelineState[] = [
  PipelineState.RUNNING,
  PipelineState.PASSED,
  PipelineState.FAILED,
  PipelineState.CANCELED,
];

/**
 * One connected repository.
 *
 * `token` is the unguessable path segment in the URL we hand out — it is also
 * the *only* way an inbound delivery finds its tenant, since the sender has no
 * session. `secret` is what proves the delivery is really from that repo:
 * GitHub signs the body with it, GitLab echoes it back in a header.
 */
export interface GitIntegrationConfig {
  id: string;
  provider: GitProvider;
  /** What the user calls the repo — `acme/web`. Display only; never matched on. */
  name: string;
  token: string;
  secret: string;
  enabled: boolean;
  createdAt: string;
  /** '' until the first delivery lands. The "did I wire this up right?" signal —
   *  without it the settings page can only ever say "saved", never "working". */
  lastEventAt: string;
  /** One line about that delivery, e.g. `main · passed · 2 issues updated`. */
  lastEventSummary: string;
}

/** A pipeline event, once the provider's payload has been read. */
export interface PipelineEvent {
  state: PipelineState;
  /** Branch the pipeline ran on — also the first place we look for a ref. */
  branch: string;
  /** Link out to the run on GitHub/GitLab. '' if the payload carried none. */
  url: string;
  /** Issue refs found in the branch, the MR/PR title and the commit message. */
  refs: string[];
}

/** A fresh integration's non-user fields. */
export function newIntegrationDefaults(): Pick<
  GitIntegrationConfig,
  'createdAt' | 'lastEventAt' | 'lastEventSummary' | 'enabled'
> {
  return {
    enabled: true,
    createdAt: new Date().toISOString(),
    lastEventAt: '',
    lastEventSummary: '',
  };
}
