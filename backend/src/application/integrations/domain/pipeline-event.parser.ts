import { createHmac, timingSafeEqual } from 'node:crypto';
import { issueRefsInText } from '@module-shared/utils/short-id.util';
import {
  GitProvider,
  PipelineEvent,
  PipelineState,
} from '@application/app-settings/domain/integration.types';

/**
 * Reading GitHub's and GitLab's webhook payloads.
 *
 * Pure functions over `unknown` — no Nest, no database, no network. Every claim
 * this file makes about a delivery (it's authentic; it's a pipeline event; it
 * mentions these issues) is decided here, so the use-case that follows only has
 * to do the writing.
 */

/** Narrow an unknown payload without pulling in a schema library. */
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Constant-time compare that can't throw on a length mismatch.
 *
 * `timingSafeEqual` requires equal-length buffers — handing it a short attacker
 * string would throw, and a thrown 500 is itself an oracle ("wrong length" vs
 * "wrong value"). Hashing both sides first makes them always 32 bytes.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Is this delivery really from the repo that holds our secret?
 *
 * The two hosts prove it differently, and neither is negotiable:
 * - **GitHub** signs the raw body — `X-Hub-Signature-256: sha256=<hmac>`. It has
 *   to be the *bytes as received*: re-serialising the parsed JSON changes key
 *   order and whitespace, and the signature stops matching.
 * - **GitLab** just echoes the secret in `X-Gitlab-Token`. Weaker, but it's what
 *   the platform offers, so it's compared in constant time and over TLS.
 */
export function verifySignature(
  provider: GitProvider,
  secret: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer | undefined,
): boolean {
  const header = (name: string): string => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };

  if (provider === GitProvider.GITLAB) {
    return secretsMatch(secret, header('x-gitlab-token'));
  }

  const sent = header('x-hub-signature-256');
  if (!sent || !rawBody) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return secretsMatch(expected, sent);
}

/**
 * GitLab pipeline statuses → our four.
 *
 * `skipped` and `manual` return null on purpose: nothing ran, so there is no
 * build state to report, and overwriting a real "failed" with "skipped" would
 * lose the only useful thing the label had to say.
 */
function gitlabState(status: string): PipelineState | null {
  switch (status) {
    case 'created':
    case 'waiting_for_resource':
    case 'preparing':
    case 'pending':
    case 'running':
    case 'scheduled':
      return PipelineState.RUNNING;
    case 'success':
      return PipelineState.PASSED;
    case 'failed':
      return PipelineState.FAILED;
    case 'canceled':
    case 'cancelled':
      return PipelineState.CANCELED;
    default:
      return null;
  }
}

/**
 * A GitLab **Pipeline Hook** (`object_kind: 'pipeline'`).
 *
 * Refs are looked for in three places, because teams name things differently:
 * the branch, the MR title (the payload carries it when the pipeline belongs to
 * one), and the head commit message.
 */
export function parseGitlabEvent(body: unknown): PipelineEvent | null {
  const root = obj(body);
  if (str(root.object_kind) !== 'pipeline') return null;

  const attrs = obj(root.object_attributes);
  const state = gitlabState(str(attrs.status));
  if (!state) return null;

  const branch = str(attrs.ref);
  const project = obj(root.project);
  // Older GitLab omits `object_attributes.url`; build it from the project.
  const url =
    str(attrs.url) ||
    (str(project.web_url) && attrs.id ? `${str(project.web_url)}/-/pipelines/${String(attrs.id)}` : '');

  return {
    state,
    branch,
    url,
    refs: issueRefsInText(
      branch,
      str(obj(root.merge_request).title),
      str(obj(root.commit).message),
      str(obj(root.commit).title),
    ),
  };
}

/**
 * A GitHub **workflow_run** event.
 *
 * `action` tells you where the run is; only `completed` carries a `conclusion`.
 * Anything else (`requested`, `in_progress`) is a run that is still going, which
 * is exactly what RUNNING means.
 */
export function parseGithubEvent(event: string, body: unknown): PipelineEvent | null {
  if (event !== 'workflow_run') return null;
  const root = obj(body);
  const run = obj(root.workflow_run);
  if (!run.id) return null;

  let state: PipelineState | null;
  if (str(root.action) === 'completed') {
    switch (str(run.conclusion)) {
      case 'success':
        state = PipelineState.PASSED;
        break;
      case 'failure':
      case 'timed_out':
      case 'startup_failure':
        state = PipelineState.FAILED;
        break;
      case 'cancelled':
        state = PipelineState.CANCELED;
        break;
      // neutral / skipped / action_required — nothing ran, so nothing to say.
      default:
        state = null;
    }
  } else {
    state = PipelineState.RUNNING;
  }
  if (!state) return null;

  const branch = str(run.head_branch);
  // A run triggered by a pull request carries the PR — its title is where a team
  // that doesn't put the ref in the branch name almost always puts it.
  const prTitles = Array.isArray(run.pull_requests)
    ? run.pull_requests.map((pr) => str(obj(pr).title))
    : [];

  return {
    state,
    branch,
    url: str(run.html_url),
    refs: issueRefsInText(branch, str(obj(run.head_commit).message), str(run.display_title), ...prTitles),
  };
}

/** Read a delivery from whichever provider sent it. */
export function parsePipelineEvent(
  provider: GitProvider,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
): PipelineEvent | null {
  if (provider === GitProvider.GITLAB) return parseGitlabEvent(body);
  const raw = headers['x-github-event'] ?? headers['X-GitHub-Event'];
  const event = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return parseGithubEvent(event, body);
}
