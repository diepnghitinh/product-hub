import { assertCanWrite, assertCanDelete } from './mcp-scope';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';
import type { McpActor } from '@application/mcp/use-cases';

/** A minimal actor at the given scope — only `scope` matters to the gate. */
const actorAt = (scope: ApiKeyScope): McpActor => ({
  tenantId: 't1',
  keyId: 'k1',
  keyName: 'CI',
  userId: 'u1',
  scope,
  clientName: 'claude-code/1.0',
});

describe('MCP scope gate', () => {
  describe('assertCanWrite', () => {
    it('blocks a read-only key', () => {
      const r = assertCanWrite(actorAt(ApiKeyScope.READ_ONLY));
      expect(r.isFailure).toBe(true);
      expect(r.error).toContain('read-only');
    });

    it('allows read-write', () => {
      expect(assertCanWrite(actorAt(ApiKeyScope.READ_WRITE)).isSuccess).toBe(true);
    });

    it('allows read-write-delete', () => {
      expect(assertCanWrite(actorAt(ApiKeyScope.READ_WRITE_DELETE)).isSuccess).toBe(true);
    });
  });

  describe('assertCanDelete', () => {
    it('blocks a read-only key', () => {
      expect(assertCanDelete(actorAt(ApiKeyScope.READ_ONLY)).isFailure).toBe(true);
    });

    it('blocks a read-write key (write is not delete)', () => {
      const r = assertCanDelete(actorAt(ApiKeyScope.READ_WRITE));
      expect(r.isFailure).toBe(true);
      expect(r.error).toContain('cannot delete');
    });

    it('allows only read-write-delete', () => {
      expect(assertCanDelete(actorAt(ApiKeyScope.READ_WRITE_DELETE)).isSuccess).toBe(true);
    });
  });
});
