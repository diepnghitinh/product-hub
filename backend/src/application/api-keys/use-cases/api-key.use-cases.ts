import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { generateApiKey, hashApiKey } from '@module-shared/utils/api-key.util';
import { CreateApiKeyDto } from '../dtos/api-key.dtos';
import { ApiKeyEntity } from '../domain/api-key.entity';
import { IApiKeyRepository } from '../repositories/api-key.repository';

export interface GeneratedApiKey {
  entity: ApiKeyEntity;
  /** Plaintext — return to the caller once, never stored. */
  plaintext: string;
}

@Injectable()
export class GenerateApiKeyUseCase
  implements
    IUsecaseExecute<
      { tenantId: string; userId: string; dto: CreateApiKeyDto },
      Result<GeneratedApiKey>
    >
{
  constructor(@Inject(IApiKeyRepository) private readonly keys: IApiKeyRepository) {}
  async execute({
    tenantId,
    userId,
    dto,
  }: {
    tenantId: string;
    userId: string;
    dto: CreateApiKeyDto;
  }): Promise<Result<GeneratedApiKey>> {
    const { key, hash, prefix } = generateApiKey();
    const created = ApiKeyEntity.create({
      tenantId,
      name: dto.name,
      keyHash: hash,
      prefix,
      createdBy: userId,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const entity = created.getValue();
    await this.keys.save(entity);
    return Result.ok({ entity, plaintext: key });
  }
}

@Injectable()
export class GetApiKeysUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<ApiKeyEntity[]>>
{
  constructor(@Inject(IApiKeyRepository) private readonly keys: IApiKeyRepository) {}
  async execute({ tenantId }: { tenantId: string }): Promise<Result<ApiKeyEntity[]>> {
    return Result.ok(await this.keys.findByTenant(tenantId));
  }
}

@Injectable()
export class RevokeApiKeyUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<void>>
{
  constructor(@Inject(IApiKeyRepository) private readonly keys: IApiKeyRepository) {}
  async execute({ id, tenantId }: { id: string; tenantId: string }): Promise<Result<void>> {
    const key = await this.keys.findById(id);
    if (!key || key.tenantId !== tenantId) return Result.fail('API key not found');
    await this.keys.delete(id);
    return Result.ok();
  }
}

@Injectable()
export class AuthenticateApiKeyUseCase
  implements IUsecaseExecute<{ key: string }, Result<ApiKeyEntity>>
{
  constructor(@Inject(IApiKeyRepository) private readonly keys: IApiKeyRepository) {}
  async execute({ key }: { key: string }): Promise<Result<ApiKeyEntity>> {
    if (!key) return Result.fail('Missing API key');
    const found = await this.keys.findByHash(hashApiKey(key));
    if (!found) return Result.fail('Invalid API key');
    found.markUsed();
    await this.keys.save(found);
    return Result.ok(found);
  }
}
