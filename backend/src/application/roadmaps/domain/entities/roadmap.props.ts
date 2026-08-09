import { UniqueEntityID } from '@core/domain';
import { RoadmapColumn, RoadmapEpic, RoadmapItemData } from '../types/roadmap-item.type';

export interface RoadmapProps {
  id: UniqueEntityID;
  tenantId: string;
  projectId: string;
  title: string;
  description: string;
  items: RoadmapItemData[];
  columns: RoadmapColumn[];
  /** The workspace template this board's columns come from, or `null` when it
   *  runs its own. While it's set, `columns` above is the dormant custom set
   *  the roadmap goes back to if it's ever unlinked — not what's on screen.
   *  Read the pair through `resolveRoadmapColumns`, never `columns` alone. */
  columnTemplateId: string | null;
  /** The epics items can be grouped under. Empty until someone defines one —
   *  unlike columns there is no default set, because an epic is a bet this
   *  particular product is making, not a horizon every roadmap shares. */
  epics: RoadmapEpic[];
  publicEnabled: boolean;
  publicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}
