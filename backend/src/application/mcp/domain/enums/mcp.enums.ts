/**
 * What an MCP call created. The two issue values are deliberately the same
 * strings as `IssueKind` so the history list can pick its icon from one field.
 */
export enum McpEntity {
  TASK = 'task',
  BUG = 'bug',
  BACKLOG_ITEM = 'backlog-item',
  DOC = 'doc',
  /** A batch of test cases written into one feature — the feature is the row. */
  TEST_CASE = 'test-case',
}

/**
 * The MCP tools that write. Stored as a plain string on the event so adding a
 * tool later never needs a migration — this enum is just the current vocabulary.
 *
 * `set_test_case_result` is deliberately absent: it changes a case rather than
 * creating one, and it already lands in the project's own History through the
 * audit log — which is where a tester goes looking for it.
 */
export enum McpTool {
  CREATE_ISSUE = 'create_issue',
  CREATE_BACKLOG_ITEM = 'create_backlog_item',
  CREATE_DOC = 'create_doc',
  ADD_TEST_CASES = 'add_test_cases',
}

/** Header the MCP server identifies itself with, e.g. `claude-code/1.2.3`. */
export const MCP_CLIENT_HEADER = 'x-mcp-client';

/** Shown in the history when a caller sends no `x-mcp-client`. */
export const UNKNOWN_MCP_CLIENT = 'MCP client';
