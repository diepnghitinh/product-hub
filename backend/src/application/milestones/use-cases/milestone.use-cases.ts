import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import {
  CreateMilestoneDto,
  ReplaceObjectivesDto,
  UpdateMilestoneDto,
} from '../dtos/milestone.dtos';
import { MilestoneEntity } from '../domain/milestone.entity';
import { IMilestoneRepository } from '../repositories/milestone.repository';

@Injectable()
export class CreateMilestoneUseCase
  implements
    IUsecaseExecute<{ tenantId: string; dto: CreateMilestoneDto }, Result<MilestoneEntity>>
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: CreateMilestoneDto;
  }): Promise<Result<MilestoneEntity>> {
    const created = MilestoneEntity.create({
      tenantId,
      title: dto.title,
      timeframe: dto.timeframe,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const milestone = created.getValue();
    await this.repo.save(milestone);
    return Result.ok(milestone);
  }
}

@Injectable()
export class GetMilestonesUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<MilestoneEntity[]>>
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({ tenantId }: { tenantId: string }): Promise<Result<MilestoneEntity[]>> {
    return Result.ok(await this.repo.findByTenant(tenantId));
  }
}

@Injectable()
export class GetMilestoneUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<MilestoneEntity>>
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({
    id,
    tenantId,
  }: {
    id: string;
    tenantId: string;
  }): Promise<Result<MilestoneEntity>> {
    const m = await this.repo.findById(id);
    if (!m || m.tenantId !== tenantId) return Result.fail('Milestone not found');
    return Result.ok(m);
  }
}

@Injectable()
export class UpdateMilestoneUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: UpdateMilestoneDto },
      Result<MilestoneEntity>
    >
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: UpdateMilestoneDto;
  }): Promise<Result<MilestoneEntity>> {
    const m = await this.repo.findById(id);
    if (!m || m.tenantId !== tenantId) return Result.fail('Milestone not found');
    m.applyMeta(dto);
    await this.repo.update(m);
    return Result.ok(m);
  }
}

@Injectable()
export class ReplaceObjectivesUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceObjectivesDto },
      Result<MilestoneEntity>
    >
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceObjectivesDto;
  }): Promise<Result<MilestoneEntity>> {
    const m = await this.repo.findById(id);
    if (!m || m.tenantId !== tenantId) return Result.fail('Milestone not found');
    m.replaceObjectives(dto.objectives);
    await this.repo.update(m);
    return Result.ok(m);
  }
}

@Injectable()
export class DeleteMilestoneUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<void>>
{
  constructor(@Inject(IMilestoneRepository) private readonly repo: IMilestoneRepository) {}
  async execute({ id, tenantId }: { id: string; tenantId: string }): Promise<Result<void>> {
    const m = await this.repo.findById(id);
    if (!m || m.tenantId !== tenantId) return Result.fail('Milestone not found');
    await this.repo.delete(id);
    return Result.ok();
  }
}
