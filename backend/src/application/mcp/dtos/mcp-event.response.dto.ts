import { ApiProperty } from '@nestjs/swagger';
import { McpEntity } from '../domain/enums/mcp.enums';

/** Flat entry shape for the "Created via MCP" history in Settings. */
export class McpEventResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keyId: string;

  @ApiProperty()
  keyName: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty({ description: 'Reported by the MCP server, e.g. claude-code' })
  clientName: string;

  @ApiProperty()
  tool: string;

  @ApiProperty({ enum: McpEntity })
  entity: McpEntity;

  @ApiProperty()
  entityId: string;

  @ApiProperty()
  entityRef: string;

  @ApiProperty()
  entityTitle: string;

  @ApiProperty({ description: "The team's name, or the roadmap's title" })
  contextLabel: string;

  @ApiProperty()
  link: string;

  @ApiProperty()
  createdAt: Date;
}
