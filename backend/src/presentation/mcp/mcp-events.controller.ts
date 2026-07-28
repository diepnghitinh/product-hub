import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { IServiceListResponse, ServiceResponse } from '@core/helpers';
import { PaginationDto } from '@module-shared/modules/pagination/pagination.dto';
import { GetMcpEventsUseCase } from '@application/mcp/use-cases';
import { McpEventResponseDto } from '@application/mcp/dtos/mcp-event.response.dto';
import { McpEventMapper } from '@application/mcp/mappers';

/**
 * Everything MCP has created in this workspace, newest first — the app-side view
 * of the same log the write endpoints append to. JWT, not API key: this is read
 * by the Settings screen, and a key should never be able to enumerate the
 * history of the others.
 */
@ApiTags('MCP')
@ApiBearerAuth('JWT-auth')
@Controller('mcp')
export class McpEventsController {
  constructor(private readonly getEvents: GetMcpEventsUseCase) {}

  @Get('events')
  @ApiOperation({ summary: 'Items created via MCP (history)' })
  async list(
    @AuthUser() auth: JwtPayload,
    @Query() query: PaginationDto,
  ): Promise<IServiceListResponse<McpEventResponseDto>> {
    const result = await this.getEvents.execute({ tenantId: auth.tenantId, query });
    const { data, total, page, limit } = result.getValue();
    return ServiceResponse.paginate(McpEventMapper.toResponseDtoArray(data), total, page, limit);
  }
}
