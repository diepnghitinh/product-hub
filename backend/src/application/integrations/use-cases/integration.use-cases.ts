import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { shareToken } from '@module-shared/utils/short-id.util';
import { AppSettingsEntity } from '@application/app-settings/domain/app-settings.entity';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import {
  GIT_PROVIDERS,
  GitIntegrationConfig,
  GitProvider,
  newIntegrationDefaults,
} from '@application/app-settings/domain/integration.types';
import { parsePipelineEvent, verifySignature } from '../domain/pipeline-event.parser';
import { SaveIntegrationDto } from '../dtos/integration.dtos';

async function loadOrDefault(
  repo: IAppSettingsRepository,
  tenantId: string,
): Promise<AppSettingsEntity> {
  return (
    (await repo.findByTenant(tenantId)) ?? AppSettingsEntity.create({ tenantId }).getValue()
  );
}

/**
 * Add a repo, or edit one that's already there.
 *
 * The URL token and the signing secret are **minted here, never accepted from
 * the client**. They're what authenticate an anonymous inbound delivery, so
 * letting a form choose them would let a workspace pick `secret: "1"` and hand
 * anyone on the internet the ability to post fake build states into it.
 */
@Injectable()
export class SaveIntegrationUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; dto: SaveIntegrationDto },
      Result<{ settings: AppSettingsEntity; integration: GitIntegrationConfig }>
    >
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}

  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: SaveIntegrationDto;
  }): Promise<Result<{ settings: AppSettingsEntity; integration: GitIntegrationConfig }>> {
    const name = dto.name?.trim();
    if (!name) return Result.fail('A repository name is required');
    if (!GIT_PROVIDERS.includes(dto.provider)) return Result.fail('Unknown git provider');

    const settings = await loadOrDefault(this.repo, tenantId);
    const list = [...settings.integrations];
    const at = list.findIndex((i) => i.id === dto.id);

    let integration: GitIntegrationConfig;
    if (at >= 0) {
      // An edit keeps the token and secret: they're already pasted into the
      // repo's webhook settings, and silently rotating them on a rename would
      // break the connection with nothing on screen to explain why.
      integration = {
        ...list[at],
        provider: dto.provider,
        name,
        enabled: dto.enabled ?? list[at].enabled,
      };
      list[at] = integration;
    } else {
      integration = {
        id: uuid(),
        provider: dto.provider,
        name,
        token: shareToken(),
        secret: shareToken() + shareToken(),
        ...newIntegrationDefaults(),
      };
      list.push(integration);
    }

    settings.setIntegrations(list);
    await this.repo.save(settings);
    return Result.ok({ settings, integration });
  }
}

/** Mint a new token + secret for one repo — the "it leaked" button. */
@Injectable()
export class RotateIntegrationSecretUseCase
  implements
    IUsecaseExecute<{ tenantId: string; id: string }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}

  async execute({
    tenantId,
    id,
  }: {
    tenantId: string;
    id: string;
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    if (!settings.integrations.some((i) => i.id === id)) {
      return Result.fail('Integration not found');
    }
    settings.setIntegrations(
      settings.integrations.map((i) =>
        i.id === id
          ? // Both, not just the secret: the token is in the URL, and a URL is
            // the thing that ends up in a screenshot or a pasted CI log.
            { ...i, token: shareToken(), secret: shareToken() + shareToken() }
          : i,
      ),
    );
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

@Injectable()
export class DeleteIntegrationUseCase
  implements IUsecaseExecute<{ tenantId: string; id: string }, Result<AppSettingsEntity>>
{
  constructor(@Inject(IAppSettingsRepository) private readonly repo: IAppSettingsRepository) {}

  async execute({
    tenantId,
    id,
  }: {
    tenantId: string;
    id: string;
  }): Promise<Result<AppSettingsEntity>> {
    const settings = await loadOrDefault(this.repo, tenantId);
    settings.setIntegrations(settings.integrations.filter((i) => i.id !== id));
    await this.repo.save(settings);
    return Result.ok(settings);
  }
}

/** What the receiving controller answers with. */
export interface PipelineDeliveryResult {
  /** false → 401. The delivery didn't prove it came from the repo. */
  authentic: boolean;
  /** Refs we found and issues we actually updated (0 is normal and fine). */
  matched: number;
  updated: number;
  /** Human line stored as `lastEventSummary`, and echoed back to the sender. */
  summary: string;
}

/**
 * Handle one inbound pipeline delivery.
 *
 * The whole feature, end to end: resolve the tenant from the URL token, prove
 * the delivery is really from that repo, read the payload, find the issue refs
 * in the branch / MR title / commit message, and stamp the build state on them.
 *
 * Nothing here trusts the caller. The tenant comes from the token, never from
 * the body; the refs are looked up scoped to that tenant; and a payload we
 * don't understand is a no-op, not an error — every git host retries and
 * eventually disables a webhook that keeps returning failures, and "your build
 * status silently stopped working" is a much worse bug than "we ignored a
 * `push` event we had nothing to say about".
 */
@Injectable()
export class RecordPipelineStateUseCase {
  private readonly logger = new Logger(RecordPipelineStateUseCase.name);

  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
  ) {}

  async execute(input: {
    token: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | undefined;
    body: unknown;
  }): Promise<Result<PipelineDeliveryResult>> {
    const settings = await this.settingsRepo.findByIntegrationToken(input.token);
    const integration = settings?.integrations.find((i) => i.token === input.token);
    // An unknown token is indistinguishable from a disabled one on purpose —
    // neither reveals whether the workspace exists.
    if (!settings || !integration || !integration.enabled) {
      return Result.ok({ authentic: false, matched: 0, updated: 0, summary: 'unknown endpoint' });
    }

    if (
      !verifySignature(
        integration.provider as GitProvider,
        integration.secret,
        input.headers,
        input.rawBody,
      )
    ) {
      this.logger.warn(`Rejected an unsigned delivery for integration ${integration.id}`);
      return Result.ok({ authentic: false, matched: 0, updated: 0, summary: 'bad signature' });
    }

    const event = parsePipelineEvent(
      integration.provider as GitProvider,
      input.headers,
      input.body,
    );
    // Authentic, but not a pipeline we report on (a push, a skipped run). Say so
    // and stop — 200, because there is nothing wrong with the sender.
    if (!event) {
      return Result.ok({ authentic: true, matched: 0, updated: 0, summary: 'ignored event' });
    }

    const updated = event.refs.length
      ? await this.issues.applyPipelineState(settings.tenantId, event.refs, {
          ciStatus: event.state,
          ciUrl: event.url,
          ciProvider: integration.provider,
          ciBranch: event.branch,
        })
      : 0;

    const summary = event.refs.length
      ? `${event.branch || 'pipeline'} · ${event.state} · ${updated} issue${updated === 1 ? '' : 's'} updated`
      : `${event.branch || 'pipeline'} · ${event.state} · no issue ref found`;

    settings.recordIntegrationDelivery(integration.id, summary);
    await this.settingsRepo.save(settings);

    return Result.ok({ authentic: true, matched: event.refs.length, updated, summary });
  }
}
