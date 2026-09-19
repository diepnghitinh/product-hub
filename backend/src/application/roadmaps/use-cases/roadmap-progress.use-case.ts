import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { roadmapItemProgress } from '../domain/roadmap-progress';
import { RoadmapItemData } from '../domain/types/roadmap-item.type';

export interface RoadmapProgressRequest {
  tenantId: string;
  /** The items to price — one roadmap's, or every roadmap's on the list route. */
  items: Pick<RoadmapItemData, 'id' | 'status'>[];
}

/**
 * `itemId → percent complete` for a set of backlog items.
 *
 * One aggregation for the whole set, however many roadmaps it spans, so the list
 * route costs the same as the detail route. Every response that carries items
 * goes through this — see the controllers' `toDto`, and
 * {@link roadmapItemProgress} for why the number is derived at all rather than
 * read off the document.
 */
@Injectable()
export class GetRoadmapProgressUseCase
  implements IUsecaseExecute<RoadmapProgressRequest, Record<string, number>>
{
  constructor(@Inject(IIssueRepository) private readonly issues: IIssueRepository) {}

  async execute({ tenantId, items }: RoadmapProgressRequest): Promise<Record<string, number>> {
    if (!items.length) return {};
    const rollups = await this.issues.roadmapItemRollups(
      tenantId,
      items.map((item) => item.id),
    );
    return Object.fromEntries(
      items.map((item) => [item.id, roadmapItemProgress(item.status, rollups[item.id])]),
    );
  }
}
