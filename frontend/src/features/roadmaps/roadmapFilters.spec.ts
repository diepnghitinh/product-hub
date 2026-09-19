import { describe, expect, it } from "vitest";
import {
  UNASSIGNED,
  encodeDateRange,
  type FilterCategory,
} from "@/components/FilterMenu";
import { ISSUE_FILTER } from "@/features/issues/issueFilters";
import { RoadmapDifficulty, RoadmapItemStatus } from "@/types/enums";
import type { RoadmapColumn, RoadmapItem } from "@/types/dto";
import {
  NO_OKR,
  ROADMAP_FILTER,
  filterRoadmapItems,
  hasRoadmapFilters,
  roadmapFilterCategories,
} from "./roadmapFilters";

/**
 * The roadmap is the one board that filters in the browser, so the reading has
 * to be pinned here rather than trusted to the API: OR within an axis, AND
 * across them, `UNASSIGNED` as a question rather than an id, and a legacy item
 * with no creator left out instead of quietly credited to whoever is asking.
 */

function item(over: Partial<RoadmapItem> & { id: string }): RoadmapItem {
  return { title: over.id, assignees: [], ...over } as RoadmapItem;
}

const ana = { id: "u-ana", name: "Ana" };
const minh = { id: "u-minh", name: "Minh" };

const items = [
  item({ id: "a", assignees: [ana], createdById: minh.id }),
  item({ id: "b", assignees: [minh, ana], createdById: minh.id }),
  item({ id: "c", assignees: [], createdById: ana.id }),
  // Legacy: created before the board stored a creator.
  item({ id: "legacy", assignees: [minh] }),
];

const ids = (list: RoadmapItem[]) => list.map((i) => i.id);

describe("filterRoadmapItems", () => {
  it("hands the array straight back when nothing is picked", () => {
    expect(filterRoadmapItems(items, {})).toBe(items);
    // An axis this module doesn't narrow on — a leftover from another board.
    expect(filterRoadmapItems(items, { projectId: ["p-1"] })).toBe(items);
    // A picked axis with nothing in it is the same as not picking it.
    expect(filterRoadmapItems(items, { [ROADMAP_FILTER.phase]: [] })).toBe(
      items,
    );
  });

  it("narrows to the items somebody is on", () => {
    expect(
      ids(filterRoadmapItems(items, { [ISSUE_FILTER.assignee]: [ana.id] })),
    ).toEqual(["a", "b"]);
  });

  it("ORs the picks inside one axis", () => {
    expect(
      ids(
        filterRoadmapItems(items, {
          [ISSUE_FILTER.assignee]: [ana.id, minh.id],
        }),
      ),
    ).toEqual(["a", "b", "legacy"]);
  });

  it('reads UNASSIGNED as "nobody is on it", not as a user id', () => {
    expect(
      ids(filterRoadmapItems(items, { [ISSUE_FILTER.assignee]: [UNASSIGNED] })),
    ).toEqual(["c"]);
  });

  it("mixes UNASSIGNED with real people in the same axis", () => {
    expect(
      ids(
        filterRoadmapItems(items, {
          [ISSUE_FILTER.assignee]: [UNASSIGNED, ana.id],
        }),
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("narrows by creator", () => {
    expect(
      ids(filterRoadmapItems(items, { [ISSUE_FILTER.creator]: [minh.id] })),
    ).toEqual(["a", "b"]);
  });

  it("ANDs the two axes", () => {
    // Ana's items, created by Minh — `c` is Ana's creation but nobody's item.
    expect(
      ids(
        filterRoadmapItems(items, {
          [ISSUE_FILTER.assignee]: [ana.id],
          [ISSUE_FILTER.creator]: [minh.id],
        }),
      ),
    ).toEqual(["a", "b"]);
  });

  it("leaves a creatorless item out of every creator pick", () => {
    for (const pick of [ana.id, minh.id, ""]) {
      expect(
        ids(filterRoadmapItems(items, { [ISSUE_FILTER.creator]: [pick] })),
      ).not.toContain("legacy");
    }
  });

  it("survives an item with no assignees array at all", () => {
    // A draft item the board has built but not yet saved.
    const draft = [{ id: "draft", title: "Draft" } as RoadmapItem];
    expect(
      ids(filterRoadmapItems(draft, { [ISSUE_FILTER.assignee]: [UNASSIGNED] })),
    ).toEqual(["draft"]);
    expect(
      filterRoadmapItems(draft, { [ISSUE_FILTER.assignee]: [ana.id] }),
    ).toEqual([]);
  });
});

/** The item's own axes — status, phase, difficulty, OKR — plus the two date
 *  windows, which are the two the timeline is read through. */
const planned = [
  item({
    id: "idea",
    status: RoadmapItemStatus.IDEA,
    phase: "now",
    difficulty: RoadmapDifficulty.EASY,
    objectiveId: "o-1",
    okrLabel: "Ship v4",
    createdAt: "2026-03-10T09:00:00.000Z",
    startDate: "2026-03-01",
    endDate: "2026-03-20",
  }),
  item({
    id: "wip",
    status: RoadmapItemStatus.IN_PROGRESS,
    phase: "next",
    difficulty: RoadmapDifficulty.HARD,
    objectiveId: "o-2",
    okrLabel: "Grow retention",
    createdAt: "2026-04-02T09:00:00.000Z",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
  }),
  // No objective, no dates — the item every "complement" question is about.
  item({
    id: "loose",
    status: RoadmapItemStatus.IDEA,
    phase: "later",
    difficulty: RoadmapDifficulty.EASY,
    createdAt: "2026-04-20T09:00:00.000Z",
  }),
];

describe("filterRoadmapItems — the item's own axes", () => {
  it("narrows by status, phase and difficulty", () => {
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ROADMAP_FILTER.status]: [RoadmapItemStatus.IDEA],
        }),
      ),
    ).toEqual(["idea", "loose"]);
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ROADMAP_FILTER.phase]: ["next", "later"],
        }),
      ),
    ).toEqual(["wip", "loose"]);
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ROADMAP_FILTER.difficulty]: [RoadmapDifficulty.HARD],
        }),
      ),
    ).toEqual(["wip"]);
  });

  it("ANDs across the item axes", () => {
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ROADMAP_FILTER.status]: [RoadmapItemStatus.IDEA],
          [ROADMAP_FILTER.phase]: ["now"],
        }),
      ),
    ).toEqual(["idea"]);
  });

  it('reads NO_OKR as "nothing asked for this"', () => {
    expect(
      ids(filterRoadmapItems(planned, { [ROADMAP_FILTER.okr]: ["o-1"] })),
    ).toEqual(["idea"]);
    expect(
      ids(filterRoadmapItems(planned, { [ROADMAP_FILTER.okr]: [NO_OKR] })),
    ).toEqual(["loose"]);
    // Mixed with a real objective in the same axis, like UNASSIGNED is.
    expect(
      ids(
        filterRoadmapItems(planned, { [ROADMAP_FILTER.okr]: [NO_OKR, "o-2"] }),
      ),
    ).toEqual(["wip", "loose"]);
  });

  it("narrows by the day an item was created, in the viewer's own days", () => {
    const range = {
      [ISSUE_FILTER.created]: encodeDateRange({
        start: "2026-04-01",
        end: "2026-04-30",
      }),
    };
    expect(ids(filterRoadmapItems(planned, range))).toEqual(["wip", "loose"]);
    // One-ended windows.
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ISSUE_FILTER.created]: encodeDateRange({
            start: "",
            end: "2026-03-31",
          }),
        }),
      ),
    ).toEqual(["idea"]);
  });

  it("matches a scheduled window by overlap, not containment", () => {
    // July sits inside `wip`'s run without touching either end of it.
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ISSUE_FILTER.scheduled]: encodeDateRange({
            start: "2026-07-01",
            end: "2026-07-31",
          }),
        }),
      ),
    ).toEqual(["wip"]);
    // Touching the last day counts; the day after does not.
    const on = (start: string, end: string) =>
      ids(
        filterRoadmapItems(planned, {
          [ISSUE_FILTER.scheduled]: encodeDateRange({ start, end }),
        }),
      );
    expect(on("2026-03-20", "2026-03-25")).toEqual(["idea"]);
    expect(on("2026-03-21", "2026-03-25")).toEqual([]);
  });

  it("leaves an item with no dates out of every scheduled window", () => {
    expect(
      ids(
        filterRoadmapItems(planned, {
          [ISSUE_FILTER.scheduled]: encodeDateRange({
            start: "2020-01-01",
            end: "2030-01-01",
          }),
        }),
      ),
    ).not.toContain("loose");
  });

  it("treats a one-ended item as the single day it has", () => {
    const oneEnded = [item({ id: "start-only", startDate: "2026-05-04" })];
    const on = (start: string, end: string) =>
      ids(
        filterRoadmapItems(oneEnded, {
          [ISSUE_FILTER.scheduled]: encodeDateRange({ start, end }),
        }),
      );
    expect(on("2026-05-04", "2026-05-04")).toEqual(["start-only"]);
    expect(on("2026-05-05", "2026-05-06")).toEqual([]);
  });
});

describe("roadmapFilterCategories", () => {
  /** The picked category, as the option-list kind — a date row has no options. */
  const optionIds = (cat?: FilterCategory) =>
    cat && "options" in cat ? cat.options.map((o) => o.id) : undefined;

  const columns: RoadmapColumn[] = [
    { key: "now", label: "Now", color: "hsl(1)" },
    { key: "next", label: "Next", color: "hsl(2)" },
  ];

  it("builds Phase from the roadmap's own columns", () => {
    const phase = roadmapFilterCategories({ columns, items: planned }).find(
      (c) => c.id === ROADMAP_FILTER.phase,
    );
    expect(optionIds(phase)).toEqual(["now", "next"]);
  });

  it("lists only the objectives the board links to, plus the complement", () => {
    const okr = roadmapFilterCategories({ columns, items: planned }).find(
      (c) => c.id === ROADMAP_FILTER.okr,
    );
    expect(optionIds(okr)).toEqual(["o-1", "o-2", NO_OKR]);
    expect(okr && "options" in okr ? okr.options[0].label : "").toBe("Ship v4");
  });

  it("drops the OKR axis whole when nothing is linked", () => {
    const cats = roadmapFilterCategories({
      columns,
      items: [item({ id: "x" })],
    });
    expect(cats.some((c) => c.id === ROADMAP_FILTER.okr)).toBe(false);
  });
});

describe("hasRoadmapFilters", () => {
  it("is true for every axis this module narrows on", () => {
    expect(hasRoadmapFilters({})).toBe(false);
    expect(hasRoadmapFilters({ [ISSUE_FILTER.assignee]: [] })).toBe(false);
    // Somebody else's axis, left in the URL by another board.
    expect(hasRoadmapFilters({ projectId: ["p-1"] })).toBe(false);

    for (const axis of [
      ROADMAP_FILTER.status,
      ROADMAP_FILTER.phase,
      ROADMAP_FILTER.difficulty,
      ROADMAP_FILTER.okr,
      ISSUE_FILTER.assignee,
      ISSUE_FILTER.creator,
      ISSUE_FILTER.created,
      ISSUE_FILTER.scheduled,
    ]) {
      expect(hasRoadmapFilters({ [axis]: ["x"] })).toBe(true);
    }
  });
});
