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
import { RecordPipelineStateUseCase } from '@application/integrations/use-cases/integration.use-cases';

/** Express, plus the raw bytes `main.ts` stashes for this route only. */
type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Where GitHub and GitLab deliver pipeline events.
 *
 * Unauthenticated by necessity — a git host has no session with us. The token in
 * the path names the integration and the signature proves the sender, which is
 * why neither is optional and neither is ever read from the body.
 */
@ApiTags('Public API')
@Public()
@Controller('public/git')
export class GitWebhooksController {
  constructor(private readonly record: RecordPipelineStateUseCase) {}

  @Post(':token')
  // 200, not 201: nothing is created, and some hosts treat an odd status as a
  // failed delivery worth retrying.
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive a GitHub / GitLab pipeline event (no auth; signed)',
    description:
      'Matches the run to issues by any TSK-/BUG- ref in the branch name, the ' +
      'MR/PR title or the commit message, and stores its state as the issue’s ' +
      'CI/CD label. Configure under Settings → Integrations.',
  })
  async receive(
    @Param('token') token: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() req: RawBodyRequest,
  ): Promise<{ ok: boolean; matched: number; updated: number; detail: string }> {
    const result = await this.record.execute({ token, headers, rawBody: req.rawBody, body });
    const out = result.getValue();

    // The one case that must NOT be a quiet 200: we couldn't prove who sent
    // this. A host showing a red delivery is how a mistyped secret gets found.
    if (!out.authentic) throw new UnauthorizedException(out.summary);

    return { ok: true, matched: out.matched, updated: out.updated, detail: out.summary };
  }
}
