import { randomUUID } from 'node:crypto';
import { Controller, Delete, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Public } from '@core/decorators';
import { MCP_CLIENT_HEADER, UNKNOWN_MCP_CLIENT } from '@application/mcp/domain/enums/mcp.enums';
import { McpActor } from '@application/mcp/use-cases';
import { ApiAuth, ApiKeyGuard } from '@presentation/api-keys/api-key.guard';
import { McpActorHolder, McpServerFactory } from './mcp-server.factory';
import { McpSession, McpSessionRegistry } from './mcp-session.registry';

/** Header the Streamable HTTP transport carries its session on. */
const SESSION_HEADER = 'mcp-session-id';

/** JSON-RPC error codes we raise before the transport ever sees the message. */
const INVALID_REQUEST = -32600;
const SESSION_NOT_FOUND = -32001;

type McpRequest = Request & { apiAuth: ApiAuth };

/**
 * The MCP endpoint itself, at `POST/GET/DELETE /v1/mcp`.
 *
 * This is what "remote MCP" means here: the assistant does not run any local
 * process, it just registers the URL and a key —
 *
 * ```
 * claude mcp add --transport http product-os https://<host>/v1/mcp \
 *   --header "x-api-key: phk_…"
 * ```
 *
 * Auth is the same `x-api-key` the REST routes on `McpController` use, checked
 * by `ApiKeyGuard` on every request — including the ones that carry a session id,
 * so revoking a key ends its sessions at the next call rather than whenever the
 * client happens to reconnect. A session is additionally pinned to the key that
 * opened it, so one key can never continue another's conversation.
 *
 * Note for Claude Desktop: its custom connectors expect OAuth, not a static
 * header, so this URL works with Claude Code and other header-capable clients
 * today. Nothing here fakes an OAuth handshake.
 */
@ApiTags('MCP')
@ApiSecurity('api-key')
@ApiExcludeController()
@Public()
@UseGuards(ApiKeyGuard)
@Controller('mcp')
export class McpHttpController {
  private readonly logger = new Logger(McpHttpController.name);

  constructor(
    private readonly factory: McpServerFactory,
    private readonly sessions: McpSessionRegistry,
  ) {}

  /** Every JSON-RPC message the client sends — `initialize`, then tool calls. */
  @Post()
  async handlePost(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const sessionId = header(req, SESSION_HEADER);
    const body: unknown = req.body;

    if (sessionId) {
      const session = this.claim(req, res, sessionId);
      if (!session) return;
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      reject(res, 400, INVALID_REQUEST, 'Missing mcp-session-id — send initialize first.');
      return;
    }

    await this.open(req, res, body);
  }

  /** The client's notification stream. Only meaningful for a live session. */
  @Get()
  async handleGet(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const session = this.require(req, res);
    if (!session) return;
    await session.transport.handleRequest(req, res);
  }

  /** The client hanging up cleanly. */
  @Delete()
  async handleDelete(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const session = this.require(req, res);
    if (!session) return;
    await session.transport.handleRequest(req, res);
  }

  /* ── Sessions ───────────────────────────────────────────────────────────── */

  /** Starts a session for an `initialize` message and answers it. */
  private async open(req: McpRequest, res: Response, body: unknown): Promise<void> {
    const holder: McpActorHolder = { actor: actorOf(req) };
    const server = this.factory.create(holder);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      // Plain JSON replies rather than an SSE stream per call: these tools answer
      // in one shot, and a buffering proxy in front of the API would stall a
      // stream that never had anything to stream.
      enableJsonResponse: true,
      onsessioninitialized: (id) => this.sessions.add(id, session),
    });

    const session: McpSession = {
      transport,
      server,
      holder,
      keyId: req.apiAuth.keyId,
      lastSeenAt: Date.now(),
    };

    transport.onclose = () => {
      if (transport.sessionId) this.sessions.remove(transport.sessionId);
      void server.close();
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      this.logger.error(`MCP initialize failed: ${(err as Error).message}`);
      void transport.close();
      if (!res.headersSent) {
        reject(res, 500, INVALID_REQUEST, 'Could not start an MCP session.');
      }
    }
  }

  /** Looks a session up, checks it belongs to this key, and refreshes its actor. */
  private claim(req: McpRequest, res: Response, sessionId: string): McpSession | undefined {
    const session = this.sessions.touch(sessionId);
    // A key mismatch is reported as "unknown session" on purpose — it tells a
    // caller nothing about whether someone else's session id exists.
    if (!session || session.keyId !== req.apiAuth.keyId) {
      reject(res, 404, SESSION_NOT_FOUND, 'Unknown MCP session — reconnect to start a new one.');
      return undefined;
    }
    session.holder.actor = actorOf(req);
    return session;
  }

  private require(req: McpRequest, res: Response): McpSession | undefined {
    const sessionId = header(req, SESSION_HEADER);
    if (!sessionId) {
      reject(res, 400, INVALID_REQUEST, 'Missing mcp-session-id.');
      return undefined;
    }
    return this.claim(req, res, sessionId);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function header(req: McpRequest, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** The key, plus whichever client it is speaking for until the handshake says. */
function actorOf(req: McpRequest): McpActor {
  const { tenantId, name, keyId, userId, scope } = req.apiAuth;
  return {
    tenantId,
    keyId,
    keyName: name,
    userId,
    scope,
    clientName: header(req, MCP_CLIENT_HEADER).slice(0, 80) || UNKNOWN_MCP_CLIENT,
  };
}

/** A JSON-RPC error, since the client parses the body before the status code. */
function reject(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}
