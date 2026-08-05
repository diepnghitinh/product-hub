/**
 * Stub for `@modelcontextprotocol/sdk/server/mcp.js` in the e2e run. It's an
 * ESM-only package; the MCP e2e exercises the REST mirror (`/v1/mcp/*`), not the
 * JSON-RPC transport that actually constructs an `McpServer`, so the factory only
 * ever holds a reference to this class — it's never instantiated here.
 */
export class McpServer {
  server = { getClientVersion: () => undefined };
  registerTool(): void {
    /* no-op */
  }
}
