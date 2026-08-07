import { Injectable, Logger } from '@nestjs/common';
import {
  CLICKUP_WEBHOOK_EVENTS,
  ClickUpStatusType,
} from '@application/app-settings/domain/clickup.types';

/** ClickUp's public REST base. v2 is the current stable API. */
const CLICKUP_API = 'https://api.clickup.com/api/v2';

/**
 * Hard ceiling on any single ClickUp call.
 *
 * These run inside a request the user is waiting on (linking a task) or inside a
 * webhook delivery ClickUp will retry. Both are far better served by failing
 * fast than by holding a connection open — 10s is generous for a single task read.
 */
const CLICKUP_TIMEOUT_MS = 10_000;

/** One ClickUp workspace ("team", in the API's older vocabulary). */
export interface ClickUpWorkspace {
  id: string;
  name: string;
  color: string;
}

/** A ClickUp task, reduced to the fields we mirror. */
export interface ClickUpTask {
  id: string;
  /** The workspace's own readable id (`DEV-123`) when the feature is on; '' otherwise. */
  customId: string;
  name: string;
  url: string;
  status: string;
  statusColor: string;
  statusType: ClickUpStatusType;
  assignees: string[];
  priority: string;
  /** ISO `YYYY-MM-DD`, or '' when the task has no due date. */
  dueDate: string;
  listName: string;
  spaceName: string;
}

/** Everything that can go wrong, as one narrow shape the use-cases branch on. */
export class ClickUpApiError extends Error {
  constructor(
    message: string,
    /** HTTP status from ClickUp; 0 when the call never completed (timeout/DNS). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'ClickUpApiError';
  }
}

/** ClickUp returns epoch **milliseconds as a string**; '' for an unset date. */
function toIsoDate(epochMs: string | number | null | undefined): string {
  if (epochMs === null || epochMs === undefined || epochMs === '') return '';
  const ms = typeof epochMs === 'string' ? Number(epochMs) : epochMs;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** Shape of the pieces of ClickUp's task payload we read. */
interface RawTask {
  id?: string;
  custom_id?: string | null;
  name?: string;
  url?: string;
  status?: { status?: string; color?: string; type?: string } | null;
  assignees?: { username?: string; email?: string }[] | null;
  priority?: { priority?: string } | null;
  due_date?: string | number | null;
  list?: { name?: string } | null;
  space?: { name?: string } | null;
}

/**
 * The only thing in the codebase that calls ClickUp.
 *
 * Deliberately three operations wide — read a task, list workspaces, manage the
 * webhook — because that is the whole of what a mirror-only integration needs.
 * Nothing here writes to a ClickUp task, so a bug in product-os can never
 * corrupt a customer's ClickUp workspace.
 *
 * Every method takes the token as an argument rather than holding one: this is a
 * multi-tenant server, and a client that remembered a credential between calls
 * would be one refactor away from using the wrong tenant's.
 */
@Injectable()
export class ClickUpClient {
  private readonly logger = new Logger(ClickUpClient.name);

  /** The workspaces a token can see. Doubles as the token's validity check. */
  async listWorkspaces(token: string): Promise<ClickUpWorkspace[]> {
    const data = await this.call<{ teams?: { id?: string; name?: string; color?: string }[] }>(
      token,
      '/team',
    );
    return (data.teams ?? []).map((w) => ({
      id: String(w.id ?? ''),
      name: w.name ?? '',
      color: w.color ?? '',
    }));
  }

  /**
   * Read one task.
   *
   * `workspaceId` is only needed for the custom-id form (`DEV-123`), where the
   * id is unique per workspace rather than globally — ClickUp requires both, and
   * omitting them turns a valid custom id into a 404.
   */
  async getTask(
    token: string,
    taskId: string,
    opts: { customId?: boolean; workspaceId?: string } = {},
  ): Promise<ClickUpTask> {
    const params = opts.customId
      ? `?custom_task_ids=true&team_id=${encodeURIComponent(opts.workspaceId ?? '')}`
      : '';
    const raw = await this.call<RawTask>(token, `/task/${encodeURIComponent(taskId)}${params}`);
    return this.toTask(raw);
  }

  /**
   * Register the webhook that makes this integration live.
   *
   * ClickUp mints the signing secret here and returns it exactly once, so the
   * caller must persist what comes back — there is no endpoint to read it again,
   * only delete-and-recreate.
   */
  async createWebhook(
    token: string,
    workspaceId: string,
    endpoint: string,
  ): Promise<{ id: string; secret: string }> {
    const data = await this.call<{
      id?: string;
      webhook?: { id?: string; secret?: string };
    }>(token, `/team/${encodeURIComponent(workspaceId)}/webhook`, {
      method: 'POST',
      body: JSON.stringify({ endpoint, events: [...CLICKUP_WEBHOOK_EVENTS] }),
    });
    const id = data.webhook?.id ?? data.id ?? '';
    const secret = data.webhook?.secret ?? '';
    if (!id || !secret) {
      throw new ClickUpApiError('ClickUp did not return a webhook id and secret', 0);
    }
    return { id, secret };
  }

  /**
   * Remove a webhook. Best-effort by contract: disconnecting must succeed even
   * if the token was already revoked, otherwise a workspace whose ClickUp admin
   * rotated the token could never clear the config on our side.
   */
  async deleteWebhook(token: string, webhookId: string): Promise<void> {
    try {
      await this.call(token, `/webhook/${encodeURIComponent(webhookId)}`, { method: 'DELETE' });
    } catch (err) {
      this.logger.warn(`Could not delete ClickUp webhook ${webhookId}: ${(err as Error).message}`);
    }
  }

  private toTask(raw: RawTask): ClickUpTask {
    const type = (raw.status?.type ?? '') as ClickUpStatusType;
    return {
      id: String(raw.id ?? ''),
      customId: raw.custom_id ?? '',
      name: raw.name ?? '',
      url: raw.url ?? '',
      status: raw.status?.status ?? '',
      statusColor: raw.status?.color ?? '',
      // Anything ClickUp invents that we don't know falls back to `custom`,
      // which is exactly what an unrecognised workspace-defined status is.
      statusType: Object.values(ClickUpStatusType).includes(type) ? type : ClickUpStatusType.CUSTOM,
      assignees: (raw.assignees ?? []).map((a) => a.username || a.email || '').filter(Boolean),
      priority: raw.priority?.priority ?? '',
      dueDate: toIsoDate(raw.due_date),
      listName: raw.list?.name ?? '',
      spaceName: raw.space?.name ?? '',
    };
  }

  /** One `fetch` with an abort-based timeout, and ClickUp's errors normalised. */
  private async call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLICKUP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${CLICKUP_API}${path}`, {
        ...init,
        headers: {
          // A personal token goes in bare — no `Bearer`. (An OAuth access token
          // would too; ClickUp doesn't use the scheme prefix on either.)
          Authorization: token,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch (err) {
      // Status 0 = the call never reached ClickUp. Worth distinguishing: it
      // means "try again", where a 401 means "your token is wrong".
      throw new ClickUpApiError((err as Error).message || 'ClickUp is unreachable', 0);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // ClickUp answers errors as `{ err, ECODE }`. Prefer its sentence to ours
      // — "Team not authorized" tells an admin far more than "HTTP 401".
      const body = (await res.json().catch(() => null)) as { err?: string } | null;
      throw new ClickUpApiError(body?.err || `ClickUp returned HTTP ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  }
}
