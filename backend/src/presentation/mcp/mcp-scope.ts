import { Result } from '@shared/logic/result';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import type { McpActor } from '@application/mcp/use-cases';

/**
 * The write/delete gate for MCP. A key's `scope` is a ceiling independent of its
 * owner's role: `read-only` may not write, and only `read-write-delete` may
 * delete. A blocked call comes back as guidance ("regenerate with write
 * access"), not a "not found" that would send an assistant chasing the wrong
 * problem.
 *
 * Kept in its own file — no MCP-SDK imports — so both the JSON-RPC factory and
 * the REST mirror can share it, and so it is unit-testable on its own.
 */
export function assertCanWrite(actor: McpActor): Result<void> {
  return actor.scope === ApiKeyScope.READ_ONLY
    ? Result.fail('This key is read-only — regenerate it with write access in Settings')
    : Result.ok();
}

export function assertCanDelete(actor: McpActor): Result<void> {
  return actor.scope === ApiKeyScope.READ_WRITE_DELETE
    ? Result.ok()
    : Result.fail('This key cannot delete — regenerate it with delete access in Settings');
}
