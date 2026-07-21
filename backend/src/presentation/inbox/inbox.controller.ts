import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import {
  GetInboxUseCase,
  MarkInboxSeenUseCase,
  MarkInboxItemReadUseCase,
} from '@application/inbox/use-cases';
import { InboxResponseDto } from '@application/inbox/dtos/inbox.response.dto';
import { MarkInboxReadDto } from '@application/inbox/dtos/mark-inbox-read.dto';

@ApiTags('Inbox')
@ApiBearerAuth('JWT-auth')
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly getInbox: GetInboxUseCase,
    private readonly markSeen: MarkInboxSeenUseCase,
    private readonly markItemRead: MarkInboxItemReadUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your inbox — mentions + assigned bugs' })
  async inbox(@AuthUser() auth: JwtPayload): Promise<InboxResponseDto> {
    const result = await this.getInbox.execute({ tenantId: auth.tenantId, userId: auth.userId });
    return result.getValue();
  }

  @Post('seen')
  @ApiOperation({ summary: 'Mark all notifications read' })
  async seen(@AuthUser() auth: JwtPayload): Promise<{ ok: true }> {
    await this.markSeen.execute({ userId: auth.userId, tenantId: auth.tenantId });
    return { ok: true };
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark one notification read (by its key)' })
  async read(
    @AuthUser() auth: JwtPayload,
    @Body() dto: MarkInboxReadDto,
  ): Promise<{ ok: true }> {
    await this.markItemRead.execute({
      userId: auth.userId,
      tenantId: auth.tenantId,
      key: dto.key,
    });
    return { ok: true };
  }
}
