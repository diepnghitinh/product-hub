import { UniqueEntityID } from '@core/domain';
import { McpEntity } from '../enums/mcp.enums';

export interface McpEventProps {
  id: UniqueEntityID;
  tenantId: string;
  /** The API key the call came in on, and its label. The name is denormalized
   *  because a key can be revoked while its history stays readable. */
  keyId: string;
  keyName: string;
  /** The key's owner — who the write was attributed to. Same reason for the name. */
  userId: string;
  userName: string;
  /** Who called, as reported by the MCP server (`x-mcp-client`). */
  clientName: string;
  /** The tool that ran — `create_issue`, `create_backlog_item`, … */
  tool: string;
  entity: McpEntity;
  entityId: string;
  /** Human handle: `TSK-6HCUHKX` for an issue, empty for a backlog item. */
  entityRef: string;
  entityTitle: string;
  /** Where it landed — the team's name, or the roadmap's title. */
  contextLabel: string;
  /** In-app path to the thing created, so the history row is clickable. */
  link: string;
  createdAt: Date;
}
