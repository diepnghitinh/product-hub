import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@core/decorators';
import { JwtPayload } from '@core/interfaces';
import { GetInboxUseCase, MarkInboxSeenUseCase } from '@application/inbox/use-cases';
import { InboxResponseDto } from '@application/inbox/dtos/inbox.response.dto';

@ApiTags('Inbox')
@ApiBearerAuth('JWT-auth')
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly getInbox: GetInboxUseCase,
    private readonly markSeen: MarkInboxSeenUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your inbox — mentions + assigned bugs' })
  async inbox(@AuthUser() auth: JwtPayload): Promise<InboxResponseDto> {
    const result = await this.getInbox.execute({ tenantId: auth.tenantId, userId: auth.userId });
    return result.getValue();
  }

  @Post('seen')
  @ApiOperation({ summary: 'Mark the inbox as seen (clears the unread count)' })
  async seen(@AuthUser() auth: JwtPayload): Promise<{ ok: true }> {
    await this.markSeen.execute({ userId: auth.userId, tenantId: auth.tenantId });
    return { ok: true };
  }
}
