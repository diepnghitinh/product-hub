import { IssueKind, RelationType } from '../domain/relation-type.enum';

/** A stored issue-to-issue link (directional: source → target). */
export interface IssueLinkRecord {
  id: string;
  tenantId: string;
  issueType: IssueKind;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  createdBy: string;
  createdAt: Date;
}

export interface CreateIssueLinkData {
  tenantId: string;
  issueType: IssueKind;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  createdBy: string;
}

/** Port for issue-link persistence. All reads are tenant-scoped. */
export abstract class IIssueLinkRepository {
  /** Every link touching an issue, from either end, oldest first. */
  findForIssue: (
    tenantId: string,
    issueType: IssueKind,
    issueId: string,
  ) => Promise<IssueLinkRecord[]>;
  /** Idempotent: a repeat (source, target, type) returns the existing row. */
  create: (data: CreateIssueLinkData) => Promise<IssueLinkRecord>;
  /** Delete one link by id, tenant-scoped. Returns whether a row was removed. */
  removeById: (tenantId: string, id: string) => Promise<boolean>;
}
