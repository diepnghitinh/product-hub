// Point the app at the throwaway e2e database BEFORE AppModule's ConfigModule
// reads it. process.env wins over any .env file, so this is authoritative.
process.env.MONGODB_URI = 'mongodb://localhost:27017/producthub_e2e';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { Role } from '@core/interfaces';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { DEFAULT_TASK_STATUSES } from '@application/tasks/domain/enums/task.enums';
import { GenerateApiKeyUseCase } from '@application/api-keys/use-cases/api-key.use-cases';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';

/**
 * End-to-end test of the MCP surface. Boots the *real* Nest application against a
 * real MongoDB (see docker mongo on :27017), seeds a tenant/user/team/keys through
 * the app's own DI, then drives the HTTP endpoints exactly as an assistant would —
 * `x-api-key` header, JSON bodies — so the whole stack runs: guard → controller →
 * use-case → mongoose → mongo. Nothing is mocked.
 *
 * The focus is the write-expansion: the scope gate (read-only can't write, only
 * read-write-delete can delete), the create/read/update/status/comment tools, and
 * the subtask orphan-guard on delete.
 */
describe('MCP (e2e)', () => {
  let app: INestApplication;
  let base: string;

  // Keys minted per scope, and the refs created during the run.
  let roKey = '';
  let rwKey = '';
  let rwdKey = '';
  let parentRef = '';
  let childRef = '';

  const TENANT = 'e2e-tenant';

  /** One HTTP call with a key. Returns status + parsed body (json or text). */
  async function call(
    method: string,
    path: string,
    key: string,
    body?: unknown,
  ): Promise<{ status: number; body: any }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'x-api-key': key,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep raw text */
    }
    // Success responses are wrapped by TransformInterceptor as `{ statusCode, data }`;
    // errors come straight from the exception filter as `{ statusCode, message }`.
    // Unwrap `.data` so a test reads the payload the same way in both worlds.
    const payload =
      parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    return { status: res.status, body: payload };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts's global setup that lives outside the module.
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: 'v1', prefix: '' });
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;

    // Clean slate: the mongo volume persists between runs, so drop the throwaway
    // db before seeding or the second run trips the unique-email index.
    const conn = app.get<Connection>(getConnectionToken());
    await conn.dropDatabase();

    // Seed through the real repositories/use-cases.
    const users = app.get<IUserRepository>(IUserRepository);
    const teams = app.get<ITeamRepository>(ITeamRepository);
    const genKey = app.get(GenerateApiKeyUseCase);

    const owner = UserEntity.create({
      tenantId: TENANT,
      email: 'admin@e2e.test',
      name: 'E2E Admin',
      passwordHash: 'x',
      role: Role.ADMIN,
    }).getValue();
    await users.save(owner);

    const team = TeamEntity.create({
      tenantId: TENANT,
      key: 'ENG',
      name: 'Engineering',
      issueType: TeamIssueType.TASK,
      statuses: DEFAULT_TASK_STATUSES,
    }).getValue();
    await teams.save(team);

    const uid = owner.id.toString();
    const mint = async (scope: ApiKeyScope) =>
      (await genKey.execute({ tenantId: TENANT, userId: uid, dto: { name: scope, scope } })).getValue()
        .plaintext;
    roKey = await mint(ApiKeyScope.READ_ONLY);
    rwKey = await mint(ApiKeyScope.READ_WRITE);
    rwdKey = await mint(ApiKeyScope.READ_WRITE_DELETE);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Scope gate ────────────────────────────────────────────────────────────
  it('lets a read-only key READ the workspace', async () => {
    const r = await call('GET', '/v1/mcp/context', roKey);
    expect(r.status).toBe(200);
    expect(r.body.teams?.some((t: any) => t.name === 'Engineering')).toBe(true);
  });

  it('blocks a read-only key from creating (scope gate)', async () => {
    const r = await call('POST', '/v1/mcp/issues', roKey, { kind: 'task', title: 'nope' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/read-only/i);
  });

  it('rejects an unknown api key', async () => {
    const r = await call('GET', '/v1/mcp/context', 'phk_not_a_real_key');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  // ── Create / read / update / status ─────────────────────────────────────────
  it('creates a task with a read-write key', async () => {
    const r = await call('POST', '/v1/mcp/issues', rwKey, {
      kind: 'task',
      title: 'Parent task',
      description: 'created via MCP e2e',
    });
    expect([200, 201]).toContain(r.status);
    expect(r.body.shortId).toMatch(/^TSK-/);
    parentRef = r.body.shortId;
  });

  it('reads the created issue back in full', async () => {
    const r = await call('GET', `/v1/mcp/issues/${parentRef}`, rwKey);
    expect(r.status).toBe(200);
    expect(r.body.title).toBe('Parent task');
    expect(r.body.subtaskCount).toBe(0);
    expect(r.body.commentCount).toBe(0);
  });

  it('updates the issue title', async () => {
    const r = await call('PATCH', `/v1/mcp/issues/${parentRef}`, rwKey, { title: 'Parent task (edited)' });
    expect(r.status).toBe(200);
    const back = await call('GET', `/v1/mcp/issues/${parentRef}`, rwKey);
    expect(back.body.title).toBe('Parent task (edited)');
  });

  it('moves the issue to another status column', async () => {
    const target = DEFAULT_TASK_STATUSES[DEFAULT_TASK_STATUSES.length - 1].key;
    const r = await call('PATCH', `/v1/mcp/issues/${parentRef}/status`, rwKey, { status: target });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe(target);
  });

  it('rejects an unknown status with guidance (didYouMean)', async () => {
    const r = await call('PATCH', `/v1/mcp/issues/${parentRef}/status`, rwKey, {
      status: 'not-a-real-column',
    });
    expect(r.status).toBe(400);
  });

  // ── Comments ────────────────────────────────────────────────────────────────
  it('adds a comment and lists it back', async () => {
    const add = await call('POST', `/v1/mcp/issues/${parentRef}/comments`, rwKey, {
      body: 'First comment from e2e',
    });
    expect([200, 201]).toContain(add.status);
    const list = await call('GET', `/v1/mcp/issues/${parentRef}/comments`, rwKey);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain('First comment from e2e');
  });

  it('reflects the comment in get_issue commentCount', async () => {
    const r = await call('GET', `/v1/mcp/issues/${parentRef}`, rwKey);
    expect(r.body.commentCount).toBe(1);
  });

  // ── Subtasks ────────────────────────────────────────────────────────────────
  it('creates a subtask via create_issue + parent', async () => {
    const r = await call('POST', '/v1/mcp/issues', rwKey, {
      kind: 'task',
      title: 'Child subtask',
      parent: parentRef,
    });
    expect([200, 201]).toContain(r.status);
    childRef = r.body.shortId;
    expect(childRef).toMatch(/^TSK-/);
  });

  it('shows the subtask under the parent (subtaskCount + search parent)', async () => {
    const detail = await call('GET', `/v1/mcp/issues/${parentRef}`, rwKey);
    expect(detail.body.subtaskCount).toBe(1);
    const search = await call('GET', `/v1/mcp/issues?parent=${parentRef}`, rwKey);
    expect(search.status).toBe(200);
    expect(JSON.stringify(search.body)).toContain(childRef);
  });

  // ── Delete: scope gate + orphan guard ───────────────────────────────────────
  it('blocks delete for a read-write key (needs delete scope)', async () => {
    const r = await call('DELETE', `/v1/mcp/issues/${childRef}`, rwKey);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/delete/i);
  });

  it('refuses to delete a parent while it still has a subtask', async () => {
    const r = await call('DELETE', `/v1/mcp/issues/${parentRef}`, rwdKey);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/subtask/i);
  });

  it('deletes the subtask, then the parent, with a delete-scoped key', async () => {
    const delChild = await call('DELETE', `/v1/mcp/issues/${childRef}`, rwdKey);
    expect(delChild.status).toBe(200);
    const delParent = await call('DELETE', `/v1/mcp/issues/${parentRef}`, rwdKey);
    expect(delParent.status).toBe(200);
    // Gone.
    const gone = await call('GET', `/v1/mcp/issues/${parentRef}`, rwKey);
    expect(gone.status).toBe(400);
  });

  // ── Docs ────────────────────────────────────────────────────────────────────
  it('creates and then edits a doc', async () => {
    const create = await call('POST', '/v1/mcp/docs', rwKey, {
      title: 'E2E Doc',
      content: '# Hello\n\nA doc from the e2e run.',
      tags: ['e2e'],
    });
    expect([200, 201]).toContain(create.status);
    const docId = create.body.id;
    const edit = await call('PATCH', `/v1/mcp/docs/${docId}`, rwKey, {
      title: 'E2E Doc (edited)',
    });
    expect(edit.status).toBe(200);
    expect(JSON.stringify(edit.body)).toContain('E2E Doc (edited)');
  });
});
