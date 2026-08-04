/**
 * What an API key is allowed to do through the MCP surface. A ceiling on the
 * key itself, independent of its owner's role: `read-only` can only read,
 * `read-write` can also create/update, `read-write-delete` can also delete.
 *
 * New keys default to `read-only` (safest for a semi-autonomous assistant); a
 * key must be created with a higher scope to write or delete. Keys that predate
 * this field carry no scope in the DB and are grandfathered to
 * `read-write-delete` in the repository, so existing integrations keep working.
 */
export enum ApiKeyScope {
  READ_ONLY = 'read-only',
  READ_WRITE = 'read-write',
  READ_WRITE_DELETE = 'read-write-delete',
}

export const API_KEY_SCOPES: ApiKeyScope[] = [
  ApiKeyScope.READ_ONLY,
  ApiKeyScope.READ_WRITE,
  ApiKeyScope.READ_WRITE_DELETE,
];
