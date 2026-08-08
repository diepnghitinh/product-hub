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

/** One space in a workspace — the top level of ClickUp's hierarchy we expose. */
export interface ClickUpSpace {
  id: string;
  name: string;
}

/**
 * One list — the thing a board is bound to, flattened.
 *
 * ClickUp nests lists under optional folders (space → folder → list, *and*
 * space → list). The picker doesn't reproduce that tree: it shows one flat list
 * of destinations with the folder as a qualifier, because the only question
 * being asked is "which list do these tasks go in?" and a two-level cascade to
 * answer it is three clicks where one will do.
 */
export interface ClickUpList {
  id: string;
  name: string;
  /** '' for a folderless list. Shown beside the name to tell two "Sprint"s apart. */
  folderName: string;
}

/** One status a list defines — the right-hand side of the status map. */
export interface ClickUpListStatusInfo {
  name: string;
  color: string;
  type: ClickUpStatusType;
  orderindex: number;
}

/** One member of a list, for matching our people to ClickUp's by email. */
export interface ClickUpMember {
  id: number;
  email: string;
  username: string;
}

/**
 * The fields we write onto a ClickUp task.
 *
 * Everything is optional and omitted-means-untouched, which is what makes the
 * unmapped-status rule expressible: a column nobody mapped simply doesn't put
 * `status` in the body, and ClickUp leaves the task where it is.
 */
export interface ClickUpTaskInput {
  name?: string;
  /** Plain text (ClickUp renders its own markdown); '' clears the description. */
  description?: string;
  /** A status *name* from the list's own set. Wrong names are a 400 from ClickUp. */
  status?: string;
  /** ClickUp member ids to assign. Create takes an array; update takes a diff. */
  assignees?: number[];
  /**
   * ClickUp member ids to un-assign. Update only — meaningless on create.
   *
   * Split from `assignees` because ClickUp's update endpoint takes
   * `{ add, rem }` rather than a replacement set, so "nobody is assigned any
   * more" is only sayable as an explicit removal list. Without it, unassigning
   * someone here would leave them assigned in ClickUp forever.
   */
  unassignees?: number[];
  /** 1 urgent · 2 high · 3 normal · 4 low. `null` clears it. */
  priority?: number | null;
  /** Epoch ms, or null to clear. */
  dueDate?: number | null;
  startDate?: number | null;
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

/**
 * Our `YYYY-MM-DD` → the epoch ms ClickUp wants, or null to clear the field.
 *
 * Anchored at **noon UTC**, not midnight. A ClickUp workspace renders due dates
 * in the viewer's own timezone, so a midnight-UTC stamp shows as the day before
 * to everyone west of Greenwich — the date silently slips by one for half the
 * planet. Noon is the only hour no real timezone offset can push across a date
 * boundary.
 */
export function toClickUpDate(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(`${iso}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
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
 * Three groups of operations, and the boundary between them is a product
 * decision rather than an accident of what the API offers:
 *
 * - **Read** — a task, the workspaces, a space's lists, a list's statuses and
 *   members. Everything the settings screens need to offer real choices instead
 *   of asking an admin to paste ids.
 * - **Write** — create and update a *task*. Only ever called for a task this
 *   workspace created in a bound list (see `ClickUpLinkOrigin`). There is
 *   deliberately no `deleteTask`: unbinding a board leaves its ClickUp tasks
 *   alone, because deleting someone's tasks is irreversible and was never what
 *   they asked for.
 * - **Webhook** — register and delete our own.
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

  /** The spaces in one workspace — the first step of the list picker. */
  async listSpaces(token: string, workspaceId: string): Promise<ClickUpSpace[]> {
    const data = await this.call<{ spaces?: { id?: string; name?: string }[] }>(
      token,
      `/team/${encodeURIComponent(workspaceId)}/space?archived=false`,
    );
    return (data.spaces ?? []).map((s) => ({ id: String(s.id ?? ''), name: s.name ?? '' }));
  }

  /**
   * Every list in a space, flattened.
   *
   * ClickUp keeps lists in two places — loose in the space, and inside folders —
   * and there is no endpoint that returns both. So this is 1 + n calls: the
   * folderless lists, then one per folder. Fine at the scale it runs (an admin
   * opening a picker), and the alternative is making them navigate a tree to
   * answer a one-line question.
   *
   * A folder that fails to read is skipped rather than failing the whole picker:
   * one archived-in-flight folder shouldn't hide the other twenty lists.
   */
  async listLists(token: string, spaceId: string): Promise<ClickUpList[]> {
    const space = encodeURIComponent(spaceId);
    const [loose, folders] = await Promise.all([
      this.call<{ lists?: { id?: string; name?: string }[] }>(
        token,
        `/space/${space}/list?archived=false`,
      ),
      this.call<{
        folders?: { id?: string; name?: string; lists?: { id?: string; name?: string }[] }[];
      }>(token, `/space/${space}/folder?archived=false`),
    ]);

    const out: ClickUpList[] = (loose.lists ?? []).map((l) => ({
      id: String(l.id ?? ''),
      name: l.name ?? '',
      folderName: '',
    }));

    for (const folder of folders.folders ?? []) {
      // The folder payload usually inlines its lists; only call out when it didn't.
      const inline = folder.lists;
      const lists =
        inline ??
        (await this.call<{ lists?: { id?: string; name?: string }[] }>(
          token,
          `/folder/${encodeURIComponent(String(folder.id ?? ''))}/list?archived=false`,
        )
          .then((d) => d.lists ?? [])
          .catch(() => []));
      for (const l of lists) {
        out.push({
          id: String(l.id ?? ''),
          name: l.name ?? '',
          folderName: folder.name ?? '',
        });
      }
    }
    return out.filter((l) => l.id);
  }

  /**
   * The statuses one list defines — the right-hand side of the status map.
   *
   * Per *list*, not per workspace: ClickUp lets every list redefine its own set,
   * which is exactly why the mapping is stored explicitly rather than guessed
   * from names at write time.
   */
  async getListStatuses(token: string, listId: string): Promise<ClickUpListStatusInfo[]> {
    const data = await this.call<{
      statuses?: { status?: string; color?: string; type?: string; orderindex?: number }[];
    }>(token, `/list/${encodeURIComponent(listId)}`);
    return (data.statuses ?? [])
      .map((s, i) => {
        const type = (s.type ?? '') as ClickUpStatusType;
        return {
          name: s.status ?? '',
          color: s.color ?? '',
          type: Object.values(ClickUpStatusType).includes(type) ? type : ClickUpStatusType.CUSTOM,
          orderindex: typeof s.orderindex === 'number' ? s.orderindex : i,
        };
      })
      .filter((s) => s.name)
      .sort((a, b) => a.orderindex - b.orderindex);
  }

  /**
   * Who can be assigned in a list.
   *
   * Assignees travel as numeric ClickUp member ids, and nothing in our data
   * holds one. Email is the only identifier both systems have, so this is what
   * the push resolves our assignees against — and someone with no ClickUp seat
   * simply doesn't appear, which is the correct outcome rather than an error.
   */
  async listMembers(token: string, listId: string): Promise<ClickUpMember[]> {
    const data = await this.call<{
      members?: { id?: number | string; email?: string; username?: string }[];
    }>(token, `/list/${encodeURIComponent(listId)}/member`);
    return (data.members ?? [])
      .map((m) => ({
        id: Number(m.id ?? 0),
        email: (m.email ?? '').toLowerCase(),
        username: m.username ?? '',
      }))
      .filter((m) => Number.isFinite(m.id) && m.id > 0);
  }

  /**
   * Everyone with a seat in the workspace.
   *
   * Distinct from {@link listMembers}, and both are needed. This is the roster
   * Settings offers when an admin pins one of our people to a ClickUp member —
   * a workspace-wide question, asked once, with no list in hand. `listMembers`
   * answers the narrower per-list question the push asks: *can this person
   * actually be assigned here?*
   *
   * Free from the same `/team` call that lists workspaces — ClickUp returns each
   * team's members inline, so this costs no extra round trip.
   */
  async listWorkspaceMembers(token: string, workspaceId: string): Promise<ClickUpMember[]> {
    const data = await this.call<{
      teams?: {
        id?: string;
        members?: { user?: { id?: number | string; email?: string; username?: string } }[];
      }[];
    }>(token, '/team');
    const team = (data.teams ?? []).find((t) => String(t.id ?? '') === workspaceId);
    return (team?.members ?? [])
      .map((m) => ({
        id: Number(m.user?.id ?? 0),
        email: (m.user?.email ?? '').toLowerCase(),
        username: m.user?.username ?? '',
      }))
      .filter((m) => Number.isFinite(m.id) && m.id > 0)
      .sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email));
  }

  /** Create a task in a bound list. Returns it in the same shape we mirror. */
  async createTask(token: string, listId: string, input: ClickUpTaskInput): Promise<ClickUpTask> {
    const raw = await this.call<RawTask>(token, `/list/${encodeURIComponent(listId)}/task`, {
      method: 'POST',
      body: JSON.stringify(this.toBody(input, { create: true })),
    });
    return this.toTask(raw);
  }

  /**
   * Update a task we created.
   *
   * ClickUp's update endpoint doesn't return the full task shape its read
   * endpoint does, so the caller gets nothing back here — a caller that needs
   * the fresh snapshot re-reads with {@link getTask}. Better an explicit second
   * read than a half-populated task that silently blanks the mirror.
   */
  async updateTask(token: string, taskId: string, input: ClickUpTaskInput): Promise<void> {
    await this.call(token, `/task/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      body: JSON.stringify(this.toBody(input, { create: false })),
    });
  }

  /**
   * Our input → ClickUp's body, with `undefined` meaning "don't touch this".
   *
   * The one asymmetry worth knowing: **create takes `assignees` as a bare array,
   * update takes it as `{ add, rem }`**. Sending a bare array to the update
   * endpoint is accepted and ignored — the worst kind of API mistake, because it
   * looks like it worked.
   */
  private toBody(input: ClickUpTaskInput, opts: { create: boolean }): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.status !== undefined) body.status = input.status;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.dueDate !== undefined) body.due_date = input.dueDate;
    if (input.startDate !== undefined) body.start_date = input.startDate;
    if (opts.create) {
      if (input.assignees !== undefined) body.assignees = input.assignees;
    } else if (input.assignees !== undefined || input.unassignees !== undefined) {
      body.assignees = { add: input.assignees ?? [], rem: input.unassignees ?? [] };
    }
    return body;
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
