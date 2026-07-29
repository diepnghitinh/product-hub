import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { IRoadmapRepository } from '@application/roadmaps/repositories/roadmap.repository';
import { IDocRepository } from '@application/docs/repositories/doc.repository';
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
    @Inject(IDocRepository) private readonly docs: IDocRepository,
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
      case FavouriteKind.Issue: {
        // A bug or task — one store, one lookup. The concrete kind is snapshotted
        // as `issueKind` so the sidebar can route + pick its icon.
        const issue = await this.issues.findByRef(req.tenantId, req.refId);
        if (!issue) return Result.fail('Issue not found');
        return Result.ok({
          kind: FavouriteKind.Issue,
          refId: issue.id.toString(),
          title: issue.title,
          teamId: issue.teamId,
          issueKind: issue.isBug ? 'bug' : 'task',
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
      case FavouriteKind.Doc: {
        // The URL may have carried either the `DOC-…` ref or the uuid — the same
        // resolve the workspace itself does. What's stored is always the uuid, so
        // a pin keeps working if the ref is ever backfilled or re-minted.
        const doc = await this.docs.findByIdOrRef(req.tenantId, req.refId);
        if (!doc) return Result.fail('Doc not found');
        return Result.ok({
          kind: FavouriteKind.Doc,
          refId: doc.id.toString(),
          title: doc.title,
          createdAt,
        });
      }
      default:
        return Result.fail('Unknown favourite kind');
    }
  }
}
