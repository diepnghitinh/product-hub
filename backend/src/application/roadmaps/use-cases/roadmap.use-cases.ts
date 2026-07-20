import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import {
  CreateRoadmapDto,
  ReplaceRoadmapColumnsDto,
  ReplaceRoadmapItemsDto,
  UpdateRoadmapDto,
} from '../dtos/roadmap.dtos';
import { RoadmapEntity } from '../domain/entities/roadmap.entity';
import { IRoadmapRepository } from '../repositories/roadmap.repository';

@Injectable()
export class CreateRoadmapUseCase
  implements IUsecaseExecute<{ tenantId: string; dto: CreateRoadmapDto }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    tenantId,
    dto,
  }: {
    tenantId: string;
    dto: CreateRoadmapDto;
  }): Promise<Result<RoadmapEntity>> {
    const created = RoadmapEntity.create({
      tenantId,
      title: dto.title,
      description: dto.description,
      projectId: dto.projectId,
    });
    if (created.isFailure) return Result.fail(created.error as string);
    const roadmap = created.getValue();
    await this.roadmaps.save(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class GetRoadmapsUseCase
  implements IUsecaseExecute<{ tenantId: string }, Result<RoadmapEntity[]>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({ tenantId }: { tenantId: string }): Promise<Result<RoadmapEntity[]>> {
    return Result.ok(await this.roadmaps.findByTenant(tenantId));
  }
}

@Injectable()
export class GetRoadmapUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
  }: {
    id: string;
    tenantId: string;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    return Result.ok(roadmap);
  }
}

@Injectable()
export class UpdateRoadmapUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; dto: UpdateRoadmapDto }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: UpdateRoadmapDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    roadmap.applyMeta(dto);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class ReplaceRoadmapItemsUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceRoadmapItemsDto },
      Result<RoadmapEntity>
    >
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceRoadmapItemsDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    roadmap.replaceItems(dto.items);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class ReplaceRoadmapColumnsUseCase
  implements
    IUsecaseExecute<
      { id: string; tenantId: string; dto: ReplaceRoadmapColumnsDto },
      Result<RoadmapEntity>
    >
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    dto,
  }: {
    id: string;
    tenantId: string;
    dto: ReplaceRoadmapColumnsDto;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    roadmap.replaceColumns(dto.columns);
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

@Injectable()
export class DeleteRoadmapUseCase
  implements IUsecaseExecute<{ id: string; tenantId: string }, Result<void>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({ id, tenantId }: { id: string; tenantId: string }): Promise<Result<void>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    await this.roadmaps.delete(id);
    return Result.ok();
  }
}

@Injectable()
export class SetRoadmapSharingUseCase
  implements
    IUsecaseExecute<{ id: string; tenantId: string; enabled: boolean }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({
    id,
    tenantId,
    enabled,
  }: {
    id: string;
    tenantId: string;
    enabled: boolean;
  }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findById(id);
    if (!roadmap || roadmap.tenantId !== tenantId) return Result.fail('Roadmap not found');
    // Reuse the existing token when re-enabling so old links keep working.
    if (enabled) roadmap.enableSharing(roadmap.publicToken ?? uuid());
    else roadmap.disableSharing();
    await this.roadmaps.update(roadmap);
    return Result.ok(roadmap);
  }
}

/** Resolve a public share token into a read-only roadmap (items + columns are embedded). */
@Injectable()
export class GetPublicRoadmapUseCase
  implements IUsecaseExecute<{ token: string }, Result<RoadmapEntity>>
{
  constructor(@Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository) {}
  async execute({ token }: { token: string }): Promise<Result<RoadmapEntity>> {
    const roadmap = await this.roadmaps.findByPublicToken(token);
    if (!roadmap) return Result.fail('This link is not available');
    return Result.ok(roadmap);
  }
}
