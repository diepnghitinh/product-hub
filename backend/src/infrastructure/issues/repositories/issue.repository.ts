import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PipelineStage } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import { resolveAssignees } from '@module-shared/utils/query-array.util';
import { dateRangeFilter } from '@module-shared/utils/date-range.util';
import { buildSearchText, normalizeSearchText } from '@module-shared/utils/search-text.util';
import { escapeRegex } from '@infrastructure/search/search-query.util';
import { CycleRollup } from '@application/cycles/domain/enums/cycle.enums';
import { BurndownIssueRow } from '@application/cycles/domain/cycle-burndown';
import {
  IssuePaginationResponse,
  IIssueRepository,
  MovedIssue,
} from '@application/issues/repositories/issue.repository';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { StabilityIssueRow } from '@application/issues/domain/bug-stability';
import {
  BUG_SEVERITIES,
  BugSeverity,
  COMPLETED_STATUS_KEYS,
  IssueKind,
} from '@application/issues/domain/enums/issue.enums';
import { ChildRollup } from '@application/issues/domain/issue-progress';
import {
  IssueSortDir,
  IssueSortField,
  QueryIssueDto,
} from '@application/issues/dtos/query-issue.dto';
import {
  BugStatDimension,
  RawBucket,
  RawBugStats,
  RawTrendRow,
} from '@application/mcp/domain/mcp-bug-stats';
import { IssueDoc } from '../entities/issue.schema';

/**
 * Field the severity rank is computed into. Prefixed like `EXACT_RANK_FIELD` so it
 * can never collide with a real document key, and projected away before the docs
 * are mapped.
 */
export const SEVERITY_RANK_FIELD = '__severityRank';

/**
 * Position on the bug scale: `low` 0 … `critical` 3, and **-1** for anything not
 * on it — every task, and any bug stored before severity was required. The -1 is
 * `$indexOfArray`'s own "not found", not a value we write, and it is what keeps
 * severity-less rows in one block (below `low` ascending, at the bottom
 * descending) instead of scattered through the list.
 */
export const severityRankExpr = { $indexOfArray: [BUG_SEVERITIES, '$severity'] };

/**
 * Whether this request's sort key has to be computed per row, which `find()`
 * cannot sort on — the one thing that decides between `find()` and the
 * aggregation path, alongside the exact-ref rank.
 */
export function needsSeverityRank(sort?: IssueSortField): boolean {
  return sort === 'severity';
}

/**
 * The Mongo sort for a list request.
 *
 * With no `sort` this is exactly the historical `{order: 1, createdAt: -1}` — the
 * board and every caller written before sorting existed depend on it byte for
 * byte.
 *
 * With an explicit sort, `order` is **dropped**. It is the drag position *within a
 * status column* (`IssueProps.order`), it leads the sort, and issues carry
 * distinct values — leaving it in would make a sort control that visibly does
 * nothing.
 *
 * The ID sort is `refPrefix` then `refSeq`, both indexed. Issues created before
 * sequential refs have neither field; Mongo sorts a missing field as null, which
 * orders before every string, so those rows form one block (at the top ascending,
 * at the bottom descending) with `createdAt` ordering them inside it. Nothing is
 * ever written to them to achieve this.
 *
 * The severity sort orders by `SEVERITY_RANK_FIELD` (see `severityRankExpr`), not
 * by the stored value: `severity` is a string, so Mongo would order it
 * alphabetically — critical, high, low, medium — which is not the scale anyone
 * means by "sort by severity".
 *
 * Every explicit sort ends in `_id`, which is the only field guaranteed unique,
 * so the order is *total*. Without it the legacy block is ordered by `createdAt`
 * alone, and the historical `migrate-issues` script bulk-created rows that share a
 * `createdAt` to the millisecond — ties Mongo may break differently between two
 * pages of the same list, which shows one row twice and skips another. The same
 * exposure exists for the `created`/`updated` sorts, so they get the tiebreak too.
 */
export function issueSortStage(
  sort?: IssueSortField,
  dir?: IssueSortDir,
): Record<string, 1 | -1> {
  // The no-sort branch stays byte-for-byte historical — no `_id` tiebreak here,
  // because every caller written before sorting existed depends on this shape.
  if (!sort) return { order: 1, createdAt: -1 };
  const d: 1 | -1 = dir === 'asc' ? 1 : -1;
  if (sort === 'created') return { createdAt: d, _id: d };
  if (sort === 'updated') return { updatedAt: d, _id: d };
  // Descending — the default, and what this sort is for: worst first, with the
  // severity-less block (rank -1) at the bottom.
  if (sort === 'severity') return { [SEVERITY_RANK_FIELD]: d, createdAt: d, _id: d };
  return { refPrefix: d, refSeq: d, createdAt: d, _id: d };
}

/**
 * A search box entry that *is* a ticket ref (`ENG-14`, `eng-14`), upper-cased to
 * the casing refs are stored in — or null when the text is anything else.
 *
 * Typing a known ref is the single most common reason anyone searches, and the
 * substring regex buries it: with sequential refs, `ENG-1` also matches `ENG-10`,
 * `ENG-19`, `ENG-100`… all of which sort ahead of it under the board's default
 * order. This is the signal used to float the one exact row to the top.
 *
 * Deliberately narrow. Only a `PREFIX-digits` shape qualifies, so ordinary text
 * searches take the untouched code path and cannot be affected at all.
 */
export const ISSUE_REF_SEARCH_RE = /^[A-Za-z][A-Za-z0-9]{0,9}-\d+$/;

export function exactRefSearch(search?: string): string | null {
  if (!search) return null;
  const text = search.trim();
  return ISSUE_REF_SEARCH_RE.test(text) ? text.toUpperCase() : null;
}

/**
 * Field the exact-match rank is computed into. Prefixed so it can never collide
 * with a real document key, and projected away before the docs are mapped.
 */
export const EXACT_RANK_FIELD = '__exactRefRank';

/**
 * Whether this list request should float an exact `shortId` match to the top.
 *
 * Only when the text is ref-shaped **and the user did not choose a sort**. An
 * explicit sort wins: someone who clicked "ID ascending" or "recently updated"
 * asked for a specific order, and silently pinning a row above it makes the
 * control look broken and the column headers lie. With no sort chosen there is no
 * user intent to override — the default `{order, createdAt}` is the board's own
 * arrangement, and "the thing you typed the id of" is a better first row than it.
 */
export function shouldRankExactRefFirst(
  exactRef: string | null,
  sort?: IssueSortField,
): boolean {
  return !!exactRef && !sort;
}

/**
 * Các nhánh $or cho một chuỗi trong ô tìm kiếm của board.
 *
 * `searchText` là nhánh chính: nó đã bỏ dấu nên "dang nh" khớp "Đăng nhập" —
 * cùng hành vi với ⌘K, vốn là điều kiện để hai ô tìm kiếm không mâu thuẫn nhau.
 * `description` giữ regex thô (không chuẩn hoá) vì nó không có bản chuẩn hoá;
 * `_id` giữ lại cho link cũ dán vào ô tìm kiếm. `title`/`shortId` không còn là
 * nhánh riêng — cả hai đã nằm trong `searchText` (xem `buildSearchText`), nên
 * gộp vào đó là mất nhánh thừa, không phải mất bề mặt tìm kiếm.
 *
 * ⚠️ Chỉ tìm đúng trên document đã có `searchText` (ghi mới hoặc đã backfill —
 * Task 6). Document cũ chưa backfill có `searchText` rỗng và sẽ không khớp qua
 * nhánh này nữa dù `title` của nó chứa từ khoá.
 */
export function buildIssueTextFilter(search: string) {
  const raw = new RegExp(escapeRegex(search), 'i');
  const norm = new RegExp(escapeRegex(normalizeSearchText(search)), 'i');
  return [{ searchText: norm }, { description: raw }, { _id: raw }];
}

/** The day part of a filter endpoint. Plain days are what the schedule fields
 *  hold, so a caller that sent a full instant is read as its UTC day. */
function scheduleDay(value?: string): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * "Its planned work touches this window" as a Mongo expression.
 *
 * `startDate`/`endDate`/`dueDate` are stored as `YYYY-MM-DD` **strings** (unset
 * is `''`), and that format sorts chronologically as text — so the whole test is
 * string comparison, with no date parsing anywhere.
 *
 * An issue given only one end is treated as a single-day window on that end,
 * which is what a board already renders it as; one with no dates at all never
 * matches, because it is not scheduled. `dueDate` is folded in as the legacy
 * mirror of `endDate` so tasks written before `endDate` existed still land in
 * their own week.
 */
export function scheduledOverlapExpr(from?: string, to?: string): Record<string, unknown> | null {
  const start = scheduleDay(from);
  const end = scheduleDay(to);
  if (!start && !end) return null;
  const firstSet = (...fields: string[]) =>
    fields.reduceRight<unknown>(
      (fallback, field) => ({ $cond: [{ $ne: [field, ''] }, field, fallback] }),
      '',
    );
  // The issue's own window, each end falling back to whichever date it has.
  const issueStart = firstSet('$startDate', '$endDate', '$dueDate');
  const issueEnd = firstSet('$endDate', '$dueDate', '$startDate');
  return {
    $and: [
      { $ne: [issueStart, ''] },
      ...(end ? [{ $lte: [issueStart, end] }] : []),
      ...(start ? [{ $gte: [issueEnd, start] }] : []),
    ],
  };
}

@Injectable()
export class IssueRepository
  extends BaseRepository<IssueEntity, IssueDoc>
  implements IIssueRepository
{
  constructor(@InjectModel('Issue') model: Model<IssueDoc>) {
    super(model);
  }

  toDomain(doc: IssueDoc): IssueEntity {
    const result = IssueEntity.create(
      {
        kind: doc.kind as IssueKind,
        tenantId: doc.tenantId,
        teamId: doc.teamId,
        ownerId: doc.ownerId,
        parentId: doc.parentId,
        shortId: doc.shortId,
        // Absent on a legacy row and left that way — never defaulted, so the
        // entity reads back `undefined` and toDocument re-emits nothing.
        refPrefix: doc.refPrefix,
        refSeq: doc.refSeq,
        title: doc.title,
        description: doc.description,
        status: doc.status,
        roadmapId: doc.roadmapId,
        roadmapItemId: doc.roadmapItemId,
        roadmapItemLabel: doc.roadmapItemLabel,
        projectId: doc.projectId,
        cycleId: doc.cycleId,
        carryOverCount: doc.carryOverCount,
        // A pre-multi-assign row has no `assignees`; the entity reads its single
        // `assigneeId`/`assigneeName` as a one-person list, so it loads unchanged.
        assignees: doc.assignees?.length ? doc.assignees : undefined,
        assigneeId: doc.assigneeId,
        assigneeName: doc.assigneeName,
        createdBy: doc.createdBy,
        createdByName: doc.createdByName,
        reporterId: doc.reporterId,
        reporterName: doc.reporterName,
        startDate: doc.startDate,
        endDate: doc.endDate,
        dueDate: doc.dueDate,
        estimate: doc.estimate,
        severity: doc.severity as BugSeverity | '',
        type: doc.type,
        caseId: doc.caseId,
        caseLabel: doc.caseLabel,
        reportId: doc.reportId,
        attachments: doc.attachments,
        labelKeys: doc.labelKeys,
        customFields: doc.customFields,
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        // Always passed explicitly (never left undefined): that's how the entity
        // tells a stored row from a brand-new issue and so doesn't stamp an old
        // already-resolved bug with today's date on load — see IssueEntity.create.
        resolvedAt: doc.resolvedAt ?? null,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(issue: IssueEntity): Partial<IssueDoc> {
    return {
      _id: issue.id.toString(),
      kind: issue.kind,
      tenantId: issue.tenantId,
      teamId: issue.teamId,
      ownerId: issue.ownerId,
      parentId: issue.parentId,
      shortId: issue.shortId,
      // `undefined` for a legacy issue — Mongoose omits undefined keys, so a save
      // never creates these fields on a row that didn't have them.
      refPrefix: issue.refPrefix,
      refSeq: issue.refSeq,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      roadmapId: issue.roadmapId,
      roadmapItemId: issue.roadmapItemId,
      roadmapItemLabel: issue.roadmapItemLabel,
      projectId: issue.projectId,
      cycleId: issue.cycleId,
      carryOverCount: issue.carryOverCount,
      assignees: issue.assignees,
      assigneeId: issue.assigneeId,
      assigneeName: issue.assigneeName,
      createdBy: issue.createdBy,
      createdByName: issue.createdByName,
      reporterId: issue.reporterId,
      reporterName: issue.reporterName,
      startDate: issue.startDate,
      endDate: issue.endDate,
      dueDate: issue.dueDate,
      estimate: issue.estimate,
      severity: issue.severity,
      type: issue.type,
      caseId: issue.caseId,
      caseLabel: issue.caseLabel,
      reportId: issue.reportId,
      attachments: issue.attachments,
      labelKeys: issue.labelKeys,
      customFields: issue.customFields,
      order: issue.order,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      resolvedAt: issue.resolvedAt,
      searchText: buildSearchText(issue.title, issue.shortId),
    };
  }

  async findById(id: string): Promise<IssueEntity | null> {
    const doc = await this.model.findById(id).lean<IssueDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByRef(tenantId: string, ref: string): Promise<IssueEntity | null> {
    // shortId first (the URL-facing id), then uuid for pre-shortId links.
    //
    // The shortId lookup is upper-cased because refs are minted and stored upper
    // case but are now typed by hand: `ENG-14` is short enough to retype from a
    // chat message or a whiteboard, unlike the random `BUG-ESP4F4T` refs that
    // came before it. The commit-message parser already accepts any casing, so
    // resolving `eng-14` in a URL keeps the two entry points consistent — without
    // it, the same ref links from a commit but 404s in the address bar. The uuid
    // fallback stays exact: uuids are lower case and never retyped.
    const doc =
      (await this.model
        .findOne({ tenantId, shortId: ref.toUpperCase() })
        .lean<IssueDoc>()
        .exec()) ??
      (await this.model.findOne({ tenantId, _id: ref }).lean<IssueDoc>().exec());
    return doc ? this.toDomain(doc) : null;
  }

  async findWithoutShortId(): Promise<{ id: string; tenantId: string }[]> {
    const docs = await this.model
      .find({ $or: [{ shortId: { $exists: false } }, { shortId: '' }] }, { tenantId: 1 })
      .sort({ createdAt: 1 })
      .lean<{ _id: string; tenantId: string }[]>()
      .exec();
    return docs.map((d) => ({ id: d._id, tenantId: d.tenantId }));
  }

  async assignMissingTeam(tenantId: string, teamId: string): Promise<number> {
    const res = await this.model
      .updateMany(
        { tenantId, $or: [{ teamId: { $exists: false } }, { teamId: '' }] },
        { $set: { teamId } },
      )
      .exec();
    return res.modifiedCount ?? 0;
  }

  async setShortId(id: string, shortId: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { shortId } }).exec();
  }

  async findByTenant(
    tenantId: string,
    query: QueryIssueDto,
    opts?: { personalOwnerId?: string },
  ): Promise<IssuePaginationResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 200;
    const filter: Record<string, unknown> = { tenantId };
    // The privacy boundary. A personal task (ownerId set) lives on exactly one
    // user's private board; `personalOwnerId` scopes the query to that owner.
    // *Every other* view passes no owner, so it filters `ownerId: ''` — personal
    // tasks are thereby excluded from all team lists and "assigned to me", and all
    // bugs (ownerId '') pass through. This is the single chokepoint that keeps
    // private tasks private; do not remove it.
    filter.ownerId = opts?.personalOwnerId ?? '';
    // Multi-value filters — a single value arrives as a 1-item array, so `$in`
    // is equivalent to the old equality match for existing callers.
    if (query.kind?.length) filter.kind = { $in: query.kind };
    // Direct id fetch (still tenant- and privacy-scoped) — how a closed cycle's
    // frozen `unfinishedIds` become visible issues again.
    if (query.ids?.length) filter._id = { $in: query.ids };
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.severity?.length) filter.severity = { $in: query.severity };
    if (query.parentId?.length) filter.parentId = { $in: query.parentId };
    if (query.roadmapItemId?.length) filter.roadmapItemId = { $in: query.roadmapItemId };
    if (query.roadmapId?.length) filter.roadmapId = { $in: query.roadmapId };
    if (query.projectId?.length) filter.projectId = { $in: query.projectId };
    // Who opened it. `createdBy` is set on every issue (a bug also mirrors it into
    // `reporterId`), so one filter serves both kinds.
    if (query.createdBy?.length) filter.createdBy = { $in: query.createdBy };
    if (query.teamId) filter.teamId = query.teamId;
    // '' is meaningful here (issues in no cycle) — sentinels like `current` were
    // already resolved to a real id (or a no-match id) by the use-case.
    if (query.cycleId !== undefined) filter.cycleId = query.cycleId;
    if (query.caseId) filter.caseId = query.caseId;
    if (query.reportId) filter.reportId = query.reportId;
    // Date windows. `resolvedAt` is null on anything still open, and null never
    // satisfies a $gte/$lte — so a solved-date filter narrows to solved issues
    // on its own, which is exactly what "solved between these dates" means.
    const created = dateRangeFilter(query.createdFrom, query.createdTo);
    if (created) filter.createdAt = created;
    const resolved = dateRangeFilter(query.resolvedFrom, query.resolvedTo);
    if (resolved) filter.resolvedAt = resolved;
    // Scheduled window — an overlap test, not a point-in-range one (see the DTO).
    // Written as a top-level `$expr` on purpose: the assignee and search clauses
    // below already own `$or`/`$and`, and a third writer of either would silently
    // drop one of the other two.
    const scheduled = scheduledOverlapExpr(query.scheduledFrom, query.scheduledTo);
    if (scheduled) filter.$expr = scheduled;
    // Assignee match. An issue counts as someone's when they are *any* of its
    // assignees, not only the primary — that's what multi-assign means for "my
    // work". Both halves are required: an issue written before multi-assign has
    // the `assigneeId` mirror and an empty `assignees`, so neither clause alone
    // covers the whole collection. Unassigned arrives as '' (from the sentinel)
    // and matches the mirror, which is '' exactly when the list is empty.
    // "Assigned to me" wins over an explicit assignee filter, as it did before.
    const wantedAssignees = query.mine
      ? [query.mine]
      : query.assigneeId?.length
        ? resolveAssignees(query.assigneeId)
        : null;
    if (wantedAssignees) {
      filter.$or = [
        { assigneeId: { $in: wantedAssignees } },
        { 'assignees.id': { $in: wantedAssignees } },
      ];
    }
    if (query.search) {
      const searchOr = buildIssueTextFilter(query.search);
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    // Two orderings need a key that isn't stored on the document: the exact-ref
    // rank (searching a full ref puts that ticket first — see
    // `shouldRankExactRefFirst`) and the severity rank (the bug scale, not the
    // alphabet — see `severityRankExpr`). `find()` cannot sort on a computed
    // field, so those cases run as an aggregation; everything else keeps the
    // original `find()` untouched. The matched set is identical either way, only
    // the order differs. The two never combine — an explicit sort turns the
    // exact-ref rank off — but each adds only its own field, so the pipeline is
    // written once for both.
    const exactRef = exactRefSearch(query.search);
    const rankExactFirst = shouldRankExactRefFirst(exactRef, query.sort);
    const rankSeverity = needsSeverityRank(query.sort);
    const sortStage = issueSortStage(query.sort, query.dir);
    const computed: Record<string, unknown> = {
      // 0 for the exact ref, 1 for everything else — ascending, so the one row
      // the user typed the id of leads and the rest keep the order they had.
      ...(rankExactFirst ? { [EXACT_RANK_FIELD]: { $cond: [{ $eq: ['$shortId', exactRef] }, 0, 1] } } : {}),
      ...(rankSeverity ? { [SEVERITY_RANK_FIELD]: severityRankExpr } : {}),
    };

    const [docs, total] = await Promise.all([
      rankExactFirst || rankSeverity
        ? this.model
            .aggregate<IssueDoc>([
              { $match: filter as FilterQuery<IssueDoc> },
              { $addFields: computed },
              { $sort: rankExactFirst ? { [EXACT_RANK_FIELD]: 1, ...sortStage } : sortStage },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              // Drop both ranks unconditionally — projecting a field the pipeline
              // never added is a no-op, and it keeps the doc shape identical to
              // the `find()` branch's.
              { $project: { [EXACT_RANK_FIELD]: 0, [SEVERITY_RANK_FIELD]: 0 } },
            ])
            .exec()
        : this.model
            .find(filter)
            .sort(sortStage)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean<IssueDoc[]>()
            .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data: docs.map((d) => this.toDomain(d)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async countByStatus(tenantId: string, status: string): Promise<number> {
    return this.model.countDocuments({ tenantId, status }).exec();
  }

  async countChildren(tenantId: string, parentId: string): Promise<number> {
    // No ownerId scoping on purpose — the orphan guard must count personal-task
    // children too, which the privacy-filtered `findByTenant` would hide.
    return this.model.countDocuments({ tenantId, parentId }).exec();
  }

  async findChildren(tenantId: string, parentId: string): Promise<IssueEntity[]> {
    // No ownerId scoping — same reasoning as countChildren. Callers that care
    // about per-child visibility (e.g. the related-history assembly in
    // GetActivityUseCase) run each result through its own `isVisibleTo` guard.
    const docs = await this.model
      .find({ tenantId, parentId })
      .lean<IssueDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async childRollups(
    tenantId: string,
    parentIds: string[],
  ): Promise<Record<string, ChildRollup>> {
    if (!parentIds.length) return {};
    // "Done" is kind-specific — a bug finishes at `resolved`/`closed`, a task at
    // `done` — and one parent can hold both, so each child is matched against
    // *its own* vocabulary rather than the union. (The union would be near
    // enough today, but only until a team names a custom task column
    // `resolved`; `isCompletedStatus` is the rule, and this is it in Mongo.)
    const rows = await this.model
      .aggregate<{ _id: string; total: number; done: number }>([
        { $match: { tenantId, parentId: { $in: parentIds } } },
        {
          $group: {
            _id: '$parentId',
            total: { $sum: 1 },
            done: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      {
                        $cond: [
                          { $eq: ['$kind', IssueKind.BUG] },
                          COMPLETED_STATUS_KEYS[IssueKind.BUG],
                          COMPLETED_STATUS_KEYS[IssueKind.TASK],
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();
    return Object.fromEntries(rows.map((r) => [r._id, { total: r.total, done: r.done }]));
  }

  async roadmapItemRollups(
    tenantId: string,
    itemIds: string[],
  ): Promise<Record<string, ChildRollup>> {
    if (!itemIds.length) return {};
    const rows = await this.model
      .aggregate<{ _id: string; total: number; done: number }>([
        { $match: { tenantId, roadmapItemId: { $in: itemIds } } },
        // Only the *roots* carry `roadmapItemId`, so the subtree under each one
        // has to be pulled in or a grandchild counts as no work at all. One
        // recursive lookup for the whole roadmap beats a level-at-a-time fan-out;
        // `maxDepth: 4` is five levels, the same cap the client's tree walk uses
        // (`issueTree.ts`), and it is what stops a corrupt `parentId` cycle.
        {
          $graphLookup: {
            from: this.model.collection.name,
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'parentId',
            as: '__descendants',
            maxDepth: 4,
            restrictSearchWithMatch: { tenantId },
          },
        },
        // Root + subtree flattened to the three fields the count needs. `_id`
        // rides along so `$addToSet` can dedupe below.
        {
          $project: {
            roadmapItemId: 1,
            node: {
              $concatArrays: [
                [{ id: '$_id', kind: '$kind', status: '$status' }],
                {
                  $map: {
                    input: '$__descendants',
                    as: 'd',
                    in: { id: '$$d._id', kind: '$$d.kind', status: '$$d.status' },
                  },
                },
              ],
            },
          },
        },
        { $unwind: '$node' },
        // See the port's note: bug rows drop out, their task children don't.
        { $match: { 'node.kind': { $ne: IssueKind.BUG } } },
        // A set, not a count: two linked issues can be parent and child of each
        // other, and that one issue must not count twice.
        { $group: { _id: '$roadmapItemId', nodes: { $addToSet: '$node' } } },
        {
          $project: {
            total: { $size: '$nodes' },
            done: {
              $size: {
                $filter: {
                  input: '$nodes',
                  as: 'n',
                  cond: { $in: ['$$n.status', COMPLETED_STATUS_KEYS[IssueKind.TASK]] },
                },
              },
            },
          },
        },
      ])
      .exec();
    return Object.fromEntries(rows.map((r) => [r._id, { total: r.total, done: r.done }]));
  }

  async cycleRollups(
    tenantId: string,
    cycleIds: string[],
    completedStatusKeys: string[],
  ): Promise<Record<string, CycleRollup>> {
    if (!cycleIds.length) return {};
    const rows = await this.model
      .aggregate<{ _id: string } & CycleRollup>([
        { $match: { tenantId, cycleId: { $in: cycleIds } } },
        {
          $group: {
            _id: '$cycleId',
            scopeCount: { $sum: 1 },
            scopePoints: { $sum: { $ifNull: ['$estimate', 0] } },
            completedCount: {
              $sum: { $cond: [{ $in: ['$status', completedStatusKeys] }, 1, 0] },
            },
            completedPoints: {
              $sum: {
                $cond: [{ $in: ['$status', completedStatusKeys] }, { $ifNull: ['$estimate', 0] }, 0],
              },
            },
            // Who is NOT done — the ids the boundary sweep will move away.
            // Same pass as the stats, so the frozen record can't disagree
            // with them (completedCount + unfinishedIds.length === scopeCount).
            unfinishedIds: {
              $push: { $cond: [{ $in: ['$status', completedStatusKeys] }, null, '$_id'] },
            },
          },
        },
        // $push can't skip, so finished issues left null placeholders — drop them.
        {
          $addFields: {
            unfinishedIds: {
              $filter: { input: '$unfinishedIds', cond: { $ne: ['$$this', null] } },
            },
          },
        },
      ])
      .exec();
    return Object.fromEntries(
      rows.map((r) => [
        r._id,
        {
          scopeCount: r.scopeCount,
          scopePoints: r.scopePoints,
          completedCount: r.completedCount,
          completedPoints: r.completedPoints,
          unfinishedIds: r.unfinishedIds,
        },
      ]),
    );
  }

  async issuesForBurndown(
    tenantId: string,
    cycleId: string,
    extraIds: string[],
  ): Promise<BurndownIssueRow[]> {
    // Current members OR the completed cycle's swept-away ids (empty while open).
    const or: FilterQuery<IssueDoc>[] = [{ cycleId }];
    if (extraIds.length) or.push({ _id: { $in: extraIds } });
    const docs = await this.model
      .find(
        { tenantId, $or: or },
        {
          createdAt: 1,
          updatedAt: 1,
          status: 1,
          estimate: 1,
          assignees: 1,
          assigneeId: 1,
          assigneeName: 1,
          labelKeys: 1,
          projectId: 1,
        },
      )
      .lean<
        Pick<
          IssueDoc,
          | 'createdAt'
          | 'updatedAt'
          | 'status'
          | 'estimate'
          | 'assignees'
          | 'assigneeId'
          | 'assigneeName'
          | 'labelKeys'
          | 'projectId'
        >[]
      >()
      .exec();
    return docs.map((d) => ({
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      status: d.status,
      estimate: d.estimate ?? 0,
      // Every person on it, so the per-assignee breakdown counts a shared issue
      // for each of them. A pre-multi-assign row falls back to its mirror.
      assignees: d.assignees?.length
        ? d.assignees.map((a) => ({ id: a.id ?? '', name: a.name ?? '' }))
        : d.assigneeId
          ? [{ id: d.assigneeId, name: d.assigneeName ?? '' }]
          : [],
      labelKeys: d.labelKeys ?? [],
      projectId: d.projectId ?? '',
    }));
  }

  async bugsForStability(
    tenantId: string,
    filter: { teamId?: string; projectId?: string; severities: string[]; until: Date },
  ): Promise<StabilityIssueRow[]> {
    const match: FilterQuery<IssueDoc> = {
      tenantId,
      kind: IssueKind.BUG,
      severity: { $in: filter.severities },
      createdAt: { $lte: filter.until },
    };
    if (filter.teamId) match.teamId = filter.teamId;
    if (filter.projectId) match.projectId = filter.projectId;

    const docs = await this.model
      .find(match, { createdAt: 1, updatedAt: 1, resolvedAt: 1, status: 1, severity: 1 })
      .lean<Pick<IssueDoc, 'createdAt' | 'updatedAt' | 'resolvedAt' | 'status' | 'severity'>[]>()
      .exec();

    return docs.map((d) => ({
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      // `?? null` because a pre-`resolvedAt` row has the key absent, not null —
      // the domain's `updatedAt` fallback keys off exactly that.
      resolvedAt: d.resolvedAt ?? null,
      status: d.status,
      severity: d.severity ?? '',
    }));
  }

  async bugStats(
    tenantId: string,
    filter: { teamId?: string; since?: Date; until?: Date },
    dimensions: BugStatDimension[],
    trend?: { unit: 'week' | 'month'; timezone: string },
  ): Promise<RawBugStats> {
    const match: FilterQuery<IssueDoc> = { tenantId, kind: IssueKind.BUG };
    if (filter.teamId) match.teamId = filter.teamId;
    if (filter.since || filter.until) {
      match.createdAt = {};
      if (filter.since) (match.createdAt as Record<string, Date>).$gte = filter.since;
      if (filter.until) (match.createdAt as Record<string, Date>).$lte = filter.until;
    }

    // Mỗi chiều một nhánh $facet — một vòng tới DB thay vì sáu.
    const facet: Record<string, object[]> = { total: [{ $count: 'n' }] };

    // Chiều vô hướng: gom thẳng. `$ifNull` để giá trị thiếu thành '' — cùng một ô
    // rỗng với hàng đã lưu '' sẵn (schema mặc định '' chứ không phải null).
    const scalar: Partial<Record<BugStatDimension, string>> = {
      status: '$status',
      severity: '$severity',
      team: '$teamId',
      project: '$projectId',
    };
    for (const dim of dimensions) {
      const path = scalar[dim];
      if (!path) continue;
      facet[dim] = [
        { $group: { _id: { $ifNull: [path, ''] }, count: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', name: { $literal: '' }, count: 1 } },
        { $sort: { count: -1 } },
      ];
    }

    // assignees là mảng {id, name} denormalized ngay trên issue
    // (issue.schema.ts:91), nên tên ra luôn từ $group — không phải chạm module
    // users, và tránh được trần 100 người của ALL_USERS.
    if (dimensions.includes('assignee')) {
      facet.assignee = [
        // Bug chưa giao có mảng rỗng — $unwind sẽ nuốt mất hàng đó, nên thay bằng
        // một phần tử rỗng để nó rơi vào ô '(unassigned)' thay vì biến mất.
        {
          $project: {
            assignees: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$assignees', []] } }, 0] },
                '$assignees',
                [{ id: '', name: '' }],
              ],
            },
          },
        },
        { $unwind: '$assignees' },
        { $group: { _id: '$assignees.id', name: { $first: '$assignees.name' }, count: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', name: 1, count: 1 } },
        { $sort: { count: -1 } },
      ];
    }

    if (dimensions.includes('label')) {
      facet.label = [
        {
          $project: {
            labelKeys: {
              $cond: [{ $gt: [{ $size: { $ifNull: ['$labelKeys', []] } }, 0] }, '$labelKeys', ['']],
            },
          },
        },
        { $unwind: '$labelKeys' },
        { $group: { _id: '$labelKeys', count: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', name: { $literal: '' }, count: 1 } },
        { $sort: { count: -1 } },
      ];
    }

    if (trend) {
      const fmt = trend.unit === 'week' ? '%G-W%V' : '%Y-%m';
      const bucket = (field: string) => ({
        $dateToString: { format: fmt, date: field, timezone: trend.timezone },
      });
      facet.opened = [
        { $group: { _id: bucket('$createdAt'), count: { $sum: 1 } } },
        { $project: { _id: 0, bucket: '$_id', count: 1 } },
      ];
      // resolvedAt null = chưa đóng (hoặc đã mở lại — entity xoá mốc khi bug rời
      // cột done). `$facet` chia sẻ chung một luồng input từ `$match` phía trên,
      // nên nhánh này KHÔNG THỂ có cửa sổ createdAt riêng — nó vẫn bị giới hạn
      // bởi since/until (lọc theo ngày mở), dù về mặt dữ liệu đúng ra "closed"
      // nên tính theo ngày đóng. Hạn chế này được chấp nhận (không tách pipeline
      // để sửa) — xem mô tả tool `get_bug_stats` để biết caveat được nêu cho caller.
      facet.closed = [
        { $match: { resolvedAt: { $ne: null } } },
        { $group: { _id: bucket('$resolvedAt'), count: { $sum: 1 } } },
        { $project: { _id: 0, bucket: '$_id', count: 1 } },
      ];
    }

    const [raw] = await this.model
      .aggregate([{ $match: match }, { $facet: facet }] as PipelineStage[])
      .exec();

    const dims: RawBugStats['dimensions'] = {};
    for (const dim of dimensions) dims[dim] = (raw?.[dim] as RawBucket[]) ?? [];

    return {
      total: (raw?.total?.[0]?.n as number) ?? 0,
      dimensions: dims,
      opened: (raw?.opened as RawTrendRow[]) ?? [],
      closed: (raw?.closed as RawTrendRow[]) ?? [],
    };
  }

  async moveUnfinishedIssues(
    tenantId: string,
    fromCycleIds: string[],
    toCycleId: string,
    completedStatusKeys: string[],
  ): Promise<MovedIssue[]> {
    if (!fromCycleIds.length) return [];
    const filter = { tenantId, cycleId: { $in: fromCycleIds }, status: { $nin: completedStatusKeys } };
    // Read the affected issues *before* the bulk write — it's the only way to
    // capture which cycle each one moved from; the write itself only knows the
    // filter, not the per-document `cycleId` it matched.
    const affected = await this.model
      .find(filter, { _id: 1, shortId: 1, cycleId: 1 })
      .lean<{ _id: string; shortId?: string; cycleId: string }[]>()
      .exec();
    if (!affected.length) return [];

    // Rolling into a real next cycle bumps the carry counter (drives the
    // "Carried over ×N" badge). Dropping to no-cycle (rollover off) clears it —
    // a detached issue isn't "carried" anywhere.
    const update = toCycleId
      ? { $set: { cycleId: toCycleId }, $inc: { carryOverCount: 1 } }
      : { $set: { cycleId: toCycleId, carryOverCount: 0 } };
    await this.model.updateMany(filter, update).exec();

    return affected.map((d) => ({
      id: d._id,
      shortId: d.shortId ?? '',
      fromCycleId: d.cycleId,
      toCycleId,
    }));
  }

  async clearCycleIds(tenantId: string, cycleIds: string[]): Promise<MovedIssue[]> {
    if (!cycleIds.length) return [];
    const filter = { tenantId, cycleId: { $in: cycleIds } };
    // Read the affected issues *before* the bulk write, exactly as
    // `moveUnfinishedIssues` does: the write only knows the filter, not the
    // per-document `cycleId` it matched, and afterwards every one of them
    // reads `''`.
    const affected = await this.model
      .find(filter, { _id: 1, shortId: 1, cycleId: 1 })
      .lean<{ _id: string; shortId?: string; cycleId: string }[]>()
      .exec();
    if (!affected.length) return [];

    await this.model.updateMany(filter, { $set: { cycleId: '', carryOverCount: 0 } }).exec();

    return affected.map((d) => ({
      id: d._id,
      shortId: d.shortId ?? '',
      fromCycleId: d.cycleId,
      toCycleId: '',
    }));
  }

  async save(issue: IssueEntity): Promise<void> {
    const doc = this.toDocument(issue);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(issue: IssueEntity): Promise<void> {
    await this.save(issue);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
