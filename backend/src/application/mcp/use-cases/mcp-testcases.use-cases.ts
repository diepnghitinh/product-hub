import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { AuditActor } from '@application/audit-log/domain/enums/audit.enums';
import { ProjectEntity } from '@application/projects/domain/entities/project.entity';
import { QueryProjectDto } from '@application/projects/dtos/query-project.dto';
import { GetProjectsUseCase } from '@application/projects/use-cases';
import { ReportEntity } from '@application/reports/domain/entities/report.entity';
import { SectionType } from '@application/reports/domain/enums/section-type.enum';
import { TestResult } from '@application/reports/domain/enums/test-result.enum';
import { TestCaseData, TestingSection } from '@application/reports/domain/types/section.types';
import { CreateReportDto } from '@application/reports/dtos/create-report.dto';
import { ImportTestCasesDto } from '@application/reports/dtos/import-test-cases.dto';
import {
  CreateReportUseCase,
  GetReportUseCase,
  GetReportsUseCase,
  ImportTestCasesUseCase,
  SetTestCaseResultUseCase,
} from '@application/reports/use-cases';
import { IUserRepository } from '@application/users/repositories/user.repository';
import { McpEventEntity } from '../domain/entities/mcp-event.entity';
import { McpEntity, McpTool } from '../domain/enums/mcp.enums';
import { didYouMean, featureLink, resolveFeature, resolveProject } from '../domain/mcp-resolve';
import {
  McpAddTestCasesDto,
  McpGetTestCasesDto,
  McpListTestFeaturesDto,
  McpSetTestCaseResultDto,
} from '../dtos/mcp.dtos';
import {
  McpAddTestCasesResponseDto,
  McpTestCaseResponseDto,
  McpTestFeatureResponseDto,
} from '../dtos/mcp.response.dto';
import { IMcpEventRepository } from '../repositories/mcp-event.repository';
import { McpActor } from './mcp.use-cases';

/**
 * Test cases over MCP.
 *
 * A test case is not a record of its own: it lives in the testing section of a
 * *feature report*, which lives in a *testing project*. Two names therefore have
 * to resolve before anything can be written, and both accept whatever the user
 * actually said — a title, a slug, the sidebar label, the team's own feature id.
 *
 * Writing goes through the same `ImportTestCasesUseCase` the spreadsheet import
 * uses, so a batch an assistant wrote and a batch dropped in as .xlsx are
 * normalised by the same rules and are indistinguishable afterwards.
 */

/** A workspace has a handful of projects; one page covers them all. */
const ALL_PROJECTS = { page: 1, limit: 100, archived: false } as QueryProjectDto;

/* ── Shared resolution ────────────────────────────────────────────────────── */

/** The named project, or a failure that lists the ones that exist. */
async function pickProject(
  getProjects: GetProjectsUseCase,
  tenantId: string,
  ref: string | undefined,
): Promise<Result<ProjectEntity>> {
  const result = await getProjects.execute({ tenantId, query: ALL_PROJECTS });
  const projects = result.getValue().data;
  if (!projects.length) {
    return Result.fail(
      'This workspace has no testing project yet — create one under Testing in the app first',
    );
  }
  const project = resolveProject(projects, ref);
  if (!project) {
    return Result.fail(
      didYouMean(
        'project',
        ref ?? '',
        projects.map((p) => p.title),
      ),
    );
  }
  return Result.ok(project);
}

/** Every case in a report, in document order. */
function casesOf(report: ReportEntity): TestCaseData[] {
  return report.sections
    .filter((s): s is TestingSection => s.type === SectionType.TESTING)
    .flatMap((s) => s.cases);
}

function toFeatureResponse(
  report: ReportEntity,
  project: ProjectEntity,
): McpTestFeatureResponseDto {
  const cases = casesOf(report);
  const count = (result: TestResult): number => cases.filter((c) => c.result === result).length;
  return {
    id: report.id.toString(),
    projectId: project.id.toString(),
    projectTitle: project.title,
    title: report.title,
    label: report.label,
    featureId: report.featureId,
    status: report.statusVariant,
    caseCount: cases.length,
    passed: count(TestResult.PASSED),
    failed: count(TestResult.FAILED),
    blocked: count(TestResult.BLOCKED),
    retest: count(TestResult.RETEST),
    skipped: count(TestResult.SKIPPED),
    untested: count(TestResult.UNTESTED),
    link: featureLink(project.id.toString(), report.id.toString()),
  };
}

function toCaseResponse(
  testCase: TestCaseData,
  report: ReportEntity,
  project: ProjectEntity,
): McpTestCaseResponseDto {
  return {
    shortId: testCase.shortId,
    area: testCase.area,
    type: testCase.type || '',
    result: testCase.result,
    owner: testCase.owner || '',
    precondition: testCase.precondition || '',
    testSteps: testCase.testSteps ?? [],
    expectedResult: testCase.expectedResult || '',
    actualResult: testCase.actualResult || '',
    note: testCase.note || '',
    featureId: report.id.toString(),
    featureTitle: report.title,
    projectId: project.id.toString(),
    projectTitle: project.title,
    link: featureLink(project.id.toString(), report.id.toString()),
  };
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

/**
 * The features of one project, each with the tally its cases add up to — the
 * "where could I write, and how is it going?" call.
 */
@Injectable()
export class McpListTestFeaturesUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpListTestFeaturesDto },
  Result<McpTestFeatureResponseDto[]>
> {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    private readonly getReports: GetReportsUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpListTestFeaturesDto;
  }): Promise<Result<McpTestFeatureResponseDto[]>> {
    const picked = await pickProject(this.getProjects, actor.tenantId, dto.project);
    if (picked.isFailure) return Result.fail(picked.error as string);
    const project = picked.getValue();

    const reports = (
      await this.getReports.execute({
        tenantId: actor.tenantId,
        projectId: project.id.toString(),
      })
    ).getValue();

    return Result.ok(reports.map((r) => toFeatureResponse(r, project)));
  }
}

/** One feature's cases, in full — steps, expected result and all. */
@Injectable()
export class McpGetTestCasesUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpGetTestCasesDto },
  Result<McpTestCaseResponseDto[]>
> {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    private readonly getReports: GetReportsUseCase,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpGetTestCasesDto;
  }): Promise<Result<McpTestCaseResponseDto[]>> {
    const picked = await pickProject(this.getProjects, actor.tenantId, dto.project);
    if (picked.isFailure) return Result.fail(picked.error as string);
    const project = picked.getValue();

    const reports = (
      await this.getReports.execute({
        tenantId: actor.tenantId,
        projectId: project.id.toString(),
      })
    ).getValue();

    const report = resolveFeature(reports, dto.feature);
    if (!report) {
      return Result.fail(
        didYouMean(
          `feature in ${project.title}`,
          dto.feature,
          reports.map((r) => r.title),
        ),
      );
    }

    const cases = casesOf(report).filter((c) => !dto.result || c.result === dto.result);
    return Result.ok(cases.map((c) => toCaseResponse(c, report, project)));
  }
}

/* ── Write ────────────────────────────────────────────────────────────────── */

/**
 * Write a batch of cases into a feature.
 *
 * An unknown feature name is an error listing the real ones rather than a new
 * feature — a typo that quietly mints "Chekout" next to "Checkout" looks saved
 * and splits a team's coverage in two. `createFeature` is how a caller says it
 * meant a new one.
 */
@Injectable()
export class McpAddTestCasesUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpAddTestCasesDto },
  Result<McpAddTestCasesResponseDto>
> {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    private readonly getReports: GetReportsUseCase,
    private readonly getReport: GetReportUseCase,
    private readonly createReport: CreateReportUseCase,
    private readonly importCases: ImportTestCasesUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IMcpEventRepository) private readonly events: IMcpEventRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpAddTestCasesDto;
  }): Promise<Result<McpAddTestCasesResponseDto>> {
    if (!dto.cases?.length) return Result.fail('No test cases were given');

    const picked = await pickProject(this.getProjects, actor.tenantId, dto.project);
    if (picked.isFailure) return Result.fail(picked.error as string);
    const project = picked.getValue();
    const projectId = project.id.toString();

    const reports = (
      await this.getReports.execute({ tenantId: actor.tenantId, projectId })
    ).getValue();

    let report = resolveFeature(reports, dto.feature);
    const featureCreated = !report;
    if (!report) {
      if (!dto.createFeature) {
        const known = reports.length
          ? `${didYouMean(
              `feature in ${project.title}`,
              dto.feature,
              reports.map((r) => r.title),
            )}. `
          : `${project.title} has no features yet. `;
        return Result.fail(
          `${known}Pass createFeature: true to add "${dto.feature}" as a new one.`,
        );
      }
      const created = await this.createReport.execute({
        tenantId: actor.tenantId,
        projectId,
        dto: { title: dto.feature } as CreateReportDto,
      });
      if (created.isFailure) return Result.fail(created.error as string);
      report = created.getValue();
    }

    // Which cases are new is worked out by diffing short ids rather than by
    // counting: `importCases` appends to the *first* testing section, so on a
    // report with two of them the new rows are in the middle, not at the end.
    const before = new Set(casesOf(report).map((c) => c.shortId));

    const imported = await this.importCases.execute({
      id: report.id.toString(),
      tenantId: actor.tenantId,
      projectId,
      dto: { cases: dto.cases } as ImportTestCasesDto,
    });
    if (imported.isFailure) return Result.fail(imported.error as string);

    const reread = await this.getReport.execute({
      id: report.id.toString(),
      tenantId: actor.tenantId,
      projectId,
    });
    if (reread.isFailure) return Result.fail(reread.error as string);
    const saved = reread.getValue();

    const added = casesOf(saved)
      .filter((c) => !before.has(c.shortId))
      .map((c) => toCaseResponse(c, saved, project));

    await this.log(actor, saved, project, added.length);

    return Result.ok({
      feature: toFeatureResponse(saved, project),
      added,
      skipped: imported.getValue().skipped,
      featureCreated,
    });
  }

  private async log(
    actor: McpActor,
    report: ReportEntity,
    project: ProjectEntity,
    added: number,
  ): Promise<void> {
    const actorUser = await this.users.findById(actor.userId);
    const event = McpEventEntity.create({
      tenantId: actor.tenantId,
      keyId: actor.keyId,
      keyName: actor.keyName,
      userId: actor.userId,
      userName: actorUser?.name ?? actor.keyName,
      clientName: actor.clientName,
      tool: McpTool.ADD_TEST_CASES,
      entity: McpEntity.TEST_CASE,
      // The feature is the thing worth opening — a single case has no page of
      // its own — so the row points at it and says how many arrived.
      entityId: report.id.toString(),
      entityRef: `+${added} ${added === 1 ? 'case' : 'cases'}`,
      entityTitle: report.title,
      contextLabel: project.title,
      link: featureLink(project.id.toString(), report.id.toString()),
    });
    if (event.isSuccess) await this.events.append(event.getValue());
  }
}

/**
 * Record a run: one case's result.
 *
 * Delegates to the same use-case the tester's dropdown and the CI API call use,
 * so the change lands in the project's History with the assistant named as the
 * actor. Without a project it searches them all — a short id is unique enough
 * that making a caller name the project first would just cost a round-trip.
 */
@Injectable()
export class McpSetTestCaseResultUseCase implements IUsecaseExecute<
  { actor: McpActor; dto: McpSetTestCaseResultDto },
  Result<McpTestCaseResponseDto>
> {
  constructor(
    private readonly getProjects: GetProjectsUseCase,
    private readonly setResult: SetTestCaseResultUseCase,
    @Inject(IUserRepository) private readonly users: IUserRepository,
  ) {}

  async execute({
    actor,
    dto,
  }: {
    actor: McpActor;
    dto: McpSetTestCaseResultDto;
  }): Promise<Result<McpTestCaseResponseDto>> {
    const shortId = dto.testCase.trim();
    const actorUser = await this.users.findById(actor.userId);
    const auditActor = {
      type: AuditActor.API,
      id: actor.userId,
      name: `${actorUser?.name ?? actor.keyName} via ${actor.clientName}`,
    };

    let candidates: ProjectEntity[];
    if (dto.project) {
      const picked = await pickProject(this.getProjects, actor.tenantId, dto.project);
      if (picked.isFailure) return Result.fail(picked.error as string);
      candidates = [picked.getValue()];
    } else {
      candidates = (
        await this.getProjects.execute({ tenantId: actor.tenantId, query: ALL_PROJECTS })
      ).getValue().data;
    }

    for (const project of candidates) {
      const outcome = await this.setResult.execute({
        tenantId: actor.tenantId,
        projectId: project.id.toString(),
        shortId,
        result: dto.result,
        actor: auditActor,
      });
      // A failure here only means "not in this project" — keep looking.
      if (outcome.isFailure) continue;

      const report = outcome.getValue();
      const found = casesOf(report).find((c) => c.shortId === shortId);
      if (found) return Result.ok(toCaseResponse(found, report, project));
    }

    return Result.fail(
      `No test case "${shortId}"${dto.project ? ` in ${dto.project}` : ''}. ` +
        'Short ids are the handle shown in the test table — get_test_cases lists them.',
    );
  }
}
