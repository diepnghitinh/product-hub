import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@core/decorators';
import { ReceiveClickUpEventUseCase } from '@application/integrations/use-cases/clickup.use-cases';

/** Express, plus the raw bytes `main.ts` stashes for this route only. */
type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Where ClickUp delivers task events.
 *
 * Unauthenticated by necessity — ClickUp has no session with us. The token in
 * the path names the workspace and the `X-Signature` HMAC proves the sender,
 * which is why neither is optional and neither is ever read from the body.
 */
@ApiTags('Public API')
@Public()
@Controller('public/clickup')
export class ClickUpWebhooksController {
  constructor(private readonly receive: ReceiveClickUpEventUseCase) {}

  @Post(':token')
  // 200, not 201: nothing is created, and ClickUp disables a webhook whose
  // deliveries keep coming back non-2xx.
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive a ClickUp task event (no auth; signed)',
    description:
      'Re-reads the task and refreshes every product-os record it is linked to. ' +
      'Display only — a ClickUp status never moves an issue on this board. ' +
      'Configure under Settings → ClickUp.',
  })
  async post(
    @Param('token') token: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() req: RawBodyRequest,
  ): Promise<{ ok: boolean; updated: number; detail: string }> {
    const result = await this.receive.execute({ token, headers, rawBody: req.rawBody, body });
    const out = result.getValue();

    // The one case that must NOT be a quiet 200: we couldn't prove who sent
    // this. ClickUp showing a failed delivery is how a broken webhook gets found.
    if (!out.authentic) throw new UnauthorizedException(out.summary);

    return { ok: true, updated: out.updated, detail: out.summary };
  }
}
