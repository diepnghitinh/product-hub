/**
 * What an MCP call created. The two issue values are deliberately the same
 * strings as `IssueKind` so the history list can pick its icon from one field.
 */
export enum McpEntity {
  TASK = 'task',
  BUG = 'bug',
  BACKLOG_ITEM = 'backlog-item',
  DOC = 'doc',
  COMMENT = 'comment',
  LINK = 'link',
}

/**
 * The MCP tools that write. Stored as a plain string on the event so adding a
 * tool later never needs a migration — this enum is just the current vocabulary.
 */
export enum McpTool {
  CREATE_ISSUE = 'create_issue',
  UPDATE_ISSUE = 'update_issue',
  SET_STATUS = 'set_issue_status',
  DELETE_ISSUE = 'delete_issue',
  ADD_COMMENT = 'add_comment',
  UPDATE_COMMENT = 'update_comment',
  DELETE_COMMENT = 'delete_comment',
  CREATE_BACKLOG_ITEM = 'create_backlog_item',
  CREATE_DOC = 'create_doc',
  UPDATE_DOC = 'update_doc',
  LINK_ISSUES = 'link_issues',
  UNLINK_ISSUES = 'unlink_issues',
}

/** Header the MCP server identifies itself with, e.g. `claude-code/1.2.3`. */
export const MCP_CLIENT_HEADER = 'x-mcp-client';

/** Shown in the history when a caller sends no `x-mcp-client`. */
export const UNKNOWN_MCP_CLIENT = 'MCP client';
