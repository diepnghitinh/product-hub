import { StoredFile } from '@application/storage/domain/stored-file.type';
import {
  RoadmapDifficulty,
  RoadmapItemStatus,
  RoadmapPhase,
} from '../enums/roadmap.enums';

/** A person assigned to a roadmap item — denormalized (id + name) so names
 * render without needing the admin-only user list. */
export interface RoadmapAssignee {
  id: string;
  name: string;
}

/** A configurable board column ("pool"). `key` is the stable value stored on
 * each item's `phase`; `label` and `color` are editable per roadmap. */
export interface RoadmapColumn {
  key: string;
  label: string;
  color: string;
}

/**
 * An **epic** — a named, coloured bucket that groups backlog items under one
 * bigger bet ("Checkout revamp"), cutting across the Now/Next/Later columns.
 *
 * Deliberately light. An epic is *not* a backlog item: it has no RICE score, no
 * comments and no detail page of its own, because everything worth saying about
 * the work is already said on the items inside it. Its dates and progress are
 * **derived** from its items rather than stored, so an epic can never disagree
 * with what's actually in it.
 *
 * Stored on the roadmap next to `columns` — same shape of decision (how this
 * board is organised), same lifecycle, and one document means an item's epic
 * label can never go stale the way its denormalized `okrLabel` can.
 */
export interface RoadmapEpic {
  /** Stable id stored on each item's `epicId`; survives rename/recolour. */
  id: string;
  label: string;
  color: string;
  /** One line of context — what this bet is. Shown as the swimlane's subtitle. */
  description: string;
}

/** Seeded for roadmaps that have no columns yet (existing + newly created). */
export const DEFAULT_ROADMAP_COLUMNS: RoadmapColumn[] = [
  { key: RoadmapPhase.NOW, label: 'Now', color: 'hsl(248 53% 58%)' },
  { key: RoadmapPhase.NEXT, label: 'Next', color: 'hsl(38 92% 50%)' },
  { key: RoadmapPhase.LATER, label: 'Later', color: 'hsl(220 9% 46%)' },
  { key: RoadmapPhase.DONE, label: 'Done', color: 'hsl(142 55% 40%)' },
];

/**
 * A named set of board columns held once for the whole workspace, that any
 * roadmap can point at instead of keeping its own.
 *
 * A roadmap runs on exactly one of two footings. **Linked** — it stores a
 * `columnTemplateId` and its columns are read live from here, so editing the
 * template moves every roadmap on it together. **Custom** — it keeps its own
 * `columns` array and nothing outside the roadmap can change it.
 *
 * Linking never erases the roadmap's own array; it's left dormant in the
 * document, so unlinking later restores the board it had rather than dropping
 * it onto a default. That's also what makes deleting a template safe: the
 * columns are copied back down onto the roadmaps that used it (see
 * `ReplaceRoadmapTemplatesUseCase`) and nothing on any board moves.
 */
export interface RoadmapColumnTemplate {
  id: string;
  name: string;
  columns: RoadmapColumn[];
  /** New roadmaps start linked to this one. At most one template carries it. */
  isDefault: boolean;
}

/**
 * The template every workspace has. Present for the same reason a team's
 * statuses have built-ins: there is always something for a roadmap to point at,
 * so "use a template" is never an empty menu.
 *
 * Its id is a fixed string rather than a generated one on purpose — the seed
 * runs whenever a workspace has no templates stored, and a fresh uuid each time
 * would break every roadmap already linked to it.
 */
export const BUILTIN_ROADMAP_TEMPLATE_ID = 'builtin-default';

/** What a workspace starts with, and falls back to if every template is removed. */
export function defaultRoadmapTemplates(): RoadmapColumnTemplate[] {
  return [
    {
      id: BUILTIN_ROADMAP_TEMPLATE_ID,
      name: 'Now / Next / Later',
      columns: DEFAULT_ROADMAP_COLUMNS,
      isDefault: true,
    },
  ];
}

/**
 * The columns a roadmap actually shows, and the template they came from.
 *
 * One function because the answer has to be the same everywhere — the API
 * response, the "which column is this?" check when an item is added, the public
 * share view. A link that no longer resolves (its template was deleted out from
 * under a stale client) reads as custom rather than as an error: the roadmap's
 * own array is still there, so the board keeps working.
 */
export function resolveRoadmapColumns(
  roadmap: { columns: RoadmapColumn[]; columnTemplateId: string | null },
  templates: RoadmapColumnTemplate[],
): { columns: RoadmapColumn[]; template: RoadmapColumnTemplate | null } {
  const template = roadmap.columnTemplateId
    ? templates.find((tpl) => tpl.id === roadmap.columnTemplateId)
    : undefined;
  if (template?.columns.length) return { columns: template.columns, template };
  return {
    columns: roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS,
    template: null,
  };
}

/** The ref prefix for a roadmap (backlog) item — `RM-6HCUHKX`, alongside
 *  `TSK-…` / `BUG-…` for issues. */
export const ROADMAP_ITEM_REF_PREFIX = 'RM';

/** A single roadmap item. RICE score is derived, not stored. */
export interface RoadmapItemData {
  id: string;
  /** Human-friendly ref used in the URL and quoted in conversation (`RM-6HCUHKX`).
   *  Minted server-side and preserved thereafter; `id` stays the real identity
   *  (comments, favourites, links and issue back-references all key off it).
   *  Optional because items created before refs existed have none until the
   *  next save or the `backfill:roadmap-item-refs` script runs. */
  shortId?: string;
  title: string;
  description: string;
  /** The column ("pool") this item sits in — a `RoadmapColumn.key`. */
  phase: string;
  /** The epic this item belongs to — a `RoadmapEpic.id`, '' when ungrouped. An
   *  item has at most one epic; that's what makes an epic a grouping rather than
   *  a tag. Only the id is stored: epics live in the same document, so the label
   *  and colour are always read live and can never go stale. Optional because
   *  items written before epics existed have no field; every read defaults it. */
  epicId?: string;
  status: RoadmapItemStatus;
  difficulty: RoadmapDifficulty;
  /** RICE inputs. */
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  /** 0–100 completion. */
  progress: number;
  /** Optional cover / UI-reference image URL ('' when unset). */
  imageUrl: string;
  /** Optional start date, ISO `YYYY-MM-DD` ('' when unset). */
  startDate: string;
  /** Optional target end date, ISO `YYYY-MM-DD` ('' when unset). The pair is the
   *  item's own planned window — the timeline draws and drags it directly. When
   *  it's unset the timeline still derives an end from the linked tasks, so an
   *  item nobody has scheduled by hand keeps the bar it always had. */
  endDate: string;
  /** People assigned (denormalized). */
  assignees: RoadmapAssignee[];
  /** Files attached to this item — the spec, the forecast, the mock. Optional
   *  because items written before attachments existed have no field; every read
   *  defaults it to `[]`. Held back from the public share view (see
   *  `RoadmapMapper.toPublicResponseDto`) — a shared roadmap is a plan, not a
   *  file drop. */
  attachments?: StoredFile[];
  /** When the item was first created (ISO). Stamped and then preserved
   *  server-side across the wholesale item replace, so reordering or editing
   *  never resets it. Optional because items created before this field existed
   *  have none stored — the mapper backfills those to the roadmap's own date. */
  createdAt?: string;
  /** When the item first entered a started status (in-progress, or straight to
   *  done), ISO. Set once then preserved; absent until work starts. Drives cycle
   *  time (startedAt → completedAt). */
  startedAt?: string;
  /** When the item first reached Done, ISO. Set once then preserved; absent until
   *  completed. Drives lead time (createdAt → completedAt). */
  completedAt?: string;
  /** Linked OKR — the milestone objective (and optionally one specific key result
   *  under it) this item advances. All denormalized so cards render without loading
   *  the milestone: `okrLabel` is the leaf title shown on the card — the key
   *  result's title when one is chosen, else the objective's. Empty strings when the
   *  item isn't linked; `keyResultId` is '' when linked at the objective level. */
  milestoneId: string;
  objectiveId: string;
  keyResultId: string;
  okrLabel: string;
}

/**
 * Find one item by whatever the caller has: its ref (`RM-6HCUHKX`, case- and
 * space-insensitive) or its uuid. One helper because every entry point — the
 * detail URL, MCP, links pasted into a doc — must resolve both: refs are new, so
 * a link handed out before they existed still has to open the same item.
 */
export function findRoadmapItem(
  items: RoadmapItemData[],
  ref: string | undefined,
): RoadmapItemData | undefined {
  if (!ref) return undefined;
  const wanted = ref.trim().toUpperCase();
  return items.find((i) => i.shortId?.toUpperCase() === wanted) ?? items.find((i) => i.id === ref);
}

/** RICE = (reach × impact × confidence) / effort. Effort 0 → score 0. */
export function riceScore(item: RoadmapItemData): number {
  if (!item.effort || item.effort <= 0) return 0;
  return Math.round((item.reach * item.impact * item.confidence) / item.effort);
}
