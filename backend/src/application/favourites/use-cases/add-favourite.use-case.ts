import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { FavouriteKind } from '../domain/favourite-kind.enum';
import { FavouriteRef } from '../domain/favourite.ref';

export interface AddFavouriteRequest {
  tenantId: string;
  userId: string;
  kind: FavouriteKind;
  refId: string;
  /** Required when kind is roadmap-item (says which board the item lives in). */
  roadmapId?: string;
}

/**
 * Pins an entity for a user. The entity is validated + hydrated from its own
 * repository (tenant-scoped) so you can't pin something from another workspace,
 * and the stored title is authoritative — never trusted from the client. Returns
 * the full, updated favourites list so the caller can replace its cache.
 */
@Injectable()
export class AddFavouriteUseCase
  implements IUsecaseExecute<AddFavouriteRequest, Result<FavouriteRef[]>>
{
  constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    // One store for both kinds — a pinned task or bug lives in the unified issues collection.
    @Inject(IIssueRepository) private readonly issues: IIssueRepository,
    @Inject(IRoadmapRepository) private readonly roadmaps: IRoadmapRepository,
  ) {}

  async execute(req: AddFavouriteRequest): Promise<Result<FavouriteRef[]>> {
    const user = await this.users.findById(req.userId);
    if (!user || user.tenantId !== req.tenantId) return Result.fail('User not found');

    const ref = await this.resolveRef(req);
    if (ref.isFailure) return Result.fail(ref.error as string);

    user.addFavourite(ref.getValue());
    await this.users.update(user);
    return Result.ok(user.favourites);
  }

  /** Look the entity up in its own store, verify tenant ownership, and take a
   *  fresh title snapshot. The stored `refId` is normalized to the canonical id. */
  private async resolveRef(req: AddFavouriteRequest): Promise<Result<FavouriteRef>> {
    const createdAt = new Date();
    switch (req.kind) {
      case FavouriteKind.Bug: {
        const bug = await this.issues.findByRef(req.tenantId, req.refId);
        if (!bug || !bug.isBug) return Result.fail('Bug not found');
        return Result.ok({
          kind: FavouriteKind.Bug,
          refId: bug.id.toString(),
          title: bug.title,
          teamId: bug.teamId,
          createdAt,
        });
      }
      case FavouriteKind.Task: {
        const task = await this.issues.findByRef(req.tenantId, req.refId);
        if (!task || !task.isTask) return Result.fail('Task not found');
        return Result.ok({
          kind: FavouriteKind.Task,
          refId: task.id.toString(),
          title: task.title,
          teamId: task.teamId,
          createdAt,
        });
      }
      case FavouriteKind.RoadmapItem: {
        if (!req.roadmapId) return Result.fail('roadmapId is required for a roadmap item');
        const roadmap = await this.roadmaps.findById(req.roadmapId);
        if (!roadmap || roadmap.tenantId !== req.tenantId) return Result.fail('Roadmap not found');
        const item = roadmap.items.find((i) => i.id === req.refId);
        if (!item) return Result.fail('Roadmap item not found');
        return Result.ok({
          kind: FavouriteKind.RoadmapItem,
          refId: item.id,
          title: item.title,
          roadmapId: roadmap.id.toString(),
          createdAt,
        });
      }
      default:
        return Result.fail('Unknown favourite kind');
    }
  }
}
