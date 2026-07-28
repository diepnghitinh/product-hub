import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpActorHolder } from './mcp-server.factory';

/** Dropped after this long without a request — an assistant that quit mid-chat
 *  never sends `DELETE`, so nothing would free the transport otherwise. */
const IDLE_MS = 30 * 60 * 1000;

/** How often idle sessions are swept. */
const SWEEP_MS = 5 * 60 * 1000;

/** Hard ceiling, so a client that reconnects in a loop cannot grow the map
 *  without bound. At the limit the least-recently-used session is evicted. */
const MAX_SESSIONS = 200;

/**
 * One live MCP session: the transport the client holds a `mcp-session-id` for,
 * the server bound to it, and the actor its tools act as.
 */
export interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  /** Mutable, and shared with the server's tools — see `McpActorHolder`. */
  holder: McpActorHolder;
  /** The API key that opened it — a session id is not transferable to another. */
  keyId: string;
  lastSeenAt: number;
}

/**
 * In-memory registry of Streamable-HTTP MCP sessions.
 *
 * Streamable HTTP is stateful by design: the client initializes once, gets an
 * `mcp-session-id`, then sends every later `tools/call` under it. Holding the
 * session is what lets the workspace record *which* assistant made a change —
 * the client only names itself during that first handshake.
 *
 * The consequence is worth stating plainly: sessions live in this process, so
 * they do not survive a restart and do not span replicas behind a load balancer.
 * A client that gets a 404 for an unknown session id simply re-initializes, so
 * the failure mode is a reconnect, not lost work.
 */
@Injectable()
export class McpSessionRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(McpSessionRegistry.name);
  private readonly sessions = new Map<string, McpSession>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_MS);
    // Never hold the process open for a housekeeping timer.
    this.sweeper.unref?.();
  }

  add(sessionId: string, session: McpSession): void {
    if (this.sessions.size >= MAX_SESSIONS) this.evictOldest();
    this.sessions.set(sessionId, session);
  }

  /** Marks the session used, so the idle sweep leaves it alone. */
  touch(sessionId: string): McpSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) session.lastSeenAt = Date.now();
    return session;
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    for (const id of [...this.sessions.keys()]) void this.close(id);
  }

  private sweep(): void {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, session] of this.sessions) {
      if (session.lastSeenAt < cutoff) void this.close(id);
    }
  }

  private evictOldest(): void {
    let oldest: string | undefined;
    let oldestSeen = Infinity;
    for (const [id, session] of this.sessions) {
      if (session.lastSeenAt < oldestSeen) {
        oldestSeen = session.lastSeenAt;
        oldest = id;
      }
    }
    if (oldest) void this.close(oldest);
  }

  /** Closing the transport fires `onclose`, which is what removes it from the map. */
  private async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    try {
      await session.transport.close();
    } catch (err) {
      this.logger.warn(`Failed to close MCP session ${sessionId}: ${(err as Error).message}`);
    }
  }
}
