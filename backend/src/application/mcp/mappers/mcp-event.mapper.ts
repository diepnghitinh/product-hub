import { McpEventEntity } from '../domain/entities/mcp-event.entity';
import { McpEventResponseDto } from '../dtos/mcp-event.response.dto';

export class McpEventMapper {
  static toResponseDto(event: McpEventEntity): McpEventResponseDto {
    return {
      id: event.id.toString(),
      keyId: event.keyId,
      keyName: event.keyName,
      userId: event.userId,
      userName: event.userName,
      clientName: event.clientName,
      tool: event.tool,
      entity: event.entity,
      entityId: event.entityId,
      entityRef: event.entityRef,
      entityTitle: event.entityTitle,
      contextLabel: event.contextLabel,
      link: event.link,
      createdAt: event.createdAt,
    };
  }

  static toResponseDtoArray(events: McpEventEntity[]): McpEventResponseDto[] {
    return events.map((e) => this.toResponseDto(e));
  }
}
