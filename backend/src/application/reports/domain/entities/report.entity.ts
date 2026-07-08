import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { v4 as uuid } from 'uuid';
import { shortId } from '@module-shared/utils/short-id.util';
import { FeatureStatus } from '../enums/feature-status.enum';
import { SectionType } from '../enums/section-type.enum';
import { TestResult } from '../enums/test-result.enum';
import {
  ReportSection,
  TestCaseData,
  TestingSection,
} from '../types/section.types';
import { ReportProps } from './report.props';

export interface SetResultOutcome {
  changed: boolean;
  oldValue?: TestResult;
  newValue?: TestResult;
  area?: string;
}

/**
 * A feature Report — one feature's sectioned document. Its `testing` sections
 * hold the test cases. The whole document body (`sections`) is edited as a unit
 * (auto-save), while test-case results can also be set individually (UI dropdown
 * or the public API) so each change can be audited.
 */
export class ReportEntity extends AggregateRoot<ReportProps> {
  private constructor(props: ReportProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      projectId: string;
      groupId?: string;
      slug: string;
      title: string;
      label?: string;
      subtitle?: string;
      featureId?: string;
      module?: string;
      statusVariant?: FeatureStatus;
      owner?: string;
      reported?: string;
      sections?: ReportSection[];
      order?: number;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<ReportEntity> {
    const guard = Guard.againstNullOrUndefinedBulk([
      { argument: props.tenantId, argumentName: 'tenantId' },
      { argument: props.projectId, argumentName: 'projectId' },
      { argument: props.slug, argumentName: 'slug' },
    ]);
    if (!guard.succeeded) return Result.fail(guard.message);

    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new ReportEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          projectId: props.projectId,
          groupId: props.groupId ?? '',
          slug: props.slug,
          title: props.title.trim(),
          subtitle: props.subtitle?.trim() || '',
          label: props.label?.trim() || props.title.trim(),
          featureId: props.featureId?.trim() || '',
          module: props.module?.trim() || '',
          statusVariant: props.statusVariant ?? FeatureStatus.TESTING,
          owner: props.owner?.trim() || '',
          reported: props.reported?.trim() || '',
          sections: props.sections ?? [],
          order: props.order ?? 0,
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get projectId(): string {
    return this.props.projectId;
  }
  get groupId(): string {
    return this.props.groupId;
  }
  get slug(): string {
    return this.props.slug;
  }
  get title(): string {
    return this.props.title;
  }
  get subtitle(): string {
    return this.props.subtitle;
  }
  get label(): string {
    return this.props.label;
  }
  get featureId(): string {
    return this.props.featureId;
  }
  get module(): string {
    return this.props.module;
  }
  get statusVariant(): FeatureStatus {
    return this.props.statusVariant;
  }
  get owner(): string {
    return this.props.owner;
  }
  get reported(): string {
    return this.props.reported;
  }
  get sections(): ReportSection[] {
    return this.props.sections;
  }
  get order(): number {
    return this.props.order;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Total number of test cases across all testing sections. */
  get caseCount(): number {
    return this.testingSections().reduce((n, s) => n + s.cases.length, 0);
  }

  rename(title: string): void {
    if (!title || title.trim().length === 0) throw new Error('title cannot be empty');
    this.props.title = title.trim();
    this.touch();
  }

  applyMeta(meta: {
    label?: string;
    subtitle?: string;
    featureId?: string;
    module?: string;
    owner?: string;
    reported?: string;
    groupId?: string;
    statusVariant?: FeatureStatus;
  }): void {
    if (meta.label !== undefined) this.props.label = meta.label.trim();
    if (meta.subtitle !== undefined) this.props.subtitle = meta.subtitle.trim();
    if (meta.featureId !== undefined) this.props.featureId = meta.featureId.trim();
    if (meta.module !== undefined) this.props.module = meta.module.trim();
    if (meta.owner !== undefined) this.props.owner = meta.owner.trim();
    if (meta.reported !== undefined) this.props.reported = meta.reported.trim();
    if (meta.groupId !== undefined) this.props.groupId = meta.groupId;
    if (meta.statusVariant !== undefined) this.props.statusVariant = meta.statusVariant;
    this.touch();
  }

  setOrder(order: number): void {
    this.props.order = order;
    this.touch();
  }

  /** Replace the whole document body (editor auto-save). */
  replaceSections(sections: ReportSection[]): void {
    this.props.sections = sections;
    this.touch();
  }

  private testingSections(): TestingSection[] {
    return this.props.sections.filter(
      (s): s is TestingSection => s.type === SectionType.TESTING,
    );
  }

  /** Ensure the report has at least one testing section, returning the first. */
  private ensureTestingSection(): TestingSection {
    let testing = this.testingSections()[0];
    if (!testing) {
      testing = {
        id: uuid(),
        type: SectionType.TESTING,
        title: 'Testing',
        coverage: [],
        cases: [],
      };
      this.props.sections.push(testing);
    }
    return testing;
  }

  /** Append imported cases (fresh ids/shortIds) to the first testing section. */
  importCases(rawCases: Omit<TestCaseData, 'id' | 'shortId'>[]): number {
    const testing = this.ensureTestingSection();
    for (const raw of rawCases) {
      testing.cases.push({ ...raw, id: uuid(), shortId: shortId() });
    }
    this.touch();
    return rawCases.length;
  }

  /**
   * Set a case's result by its shortId. No-op (same value) returns changed:false
   * so callers don't audit meaningless writes.
   */
  setResultByShortId(shortId: string, result: TestResult): SetResultOutcome {
    for (const section of this.testingSections()) {
      const found = section.cases.find((c) => c.shortId === shortId);
      if (found) {
        if (found.result === result) {
          return { changed: false, oldValue: found.result, area: found.area };
        }
        const oldValue = found.result;
        found.result = result;
        this.touch();
        return { changed: true, oldValue, newValue: result, area: found.area };
      }
    }
    return { changed: false };
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
