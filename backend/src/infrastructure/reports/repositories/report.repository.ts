import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { BaseRepository } from '@core/infrastructure/database/mongoose/base';
import {
  IReportRepository,
  ProjectReportStats,
} from '@application/reports/repositories/report.repository';
import { ReportEntity } from '@application/reports/domain/entities/report.entity';
import { FeatureStatus } from '@application/reports/domain/enums/feature-status.enum';
import { ReportDoc } from '../entities/report.schema';

@Injectable()
export class ReportRepository
  extends BaseRepository<ReportEntity, ReportDoc>
  implements IReportRepository
{
  constructor(@InjectModel('Report') model: Model<ReportDoc>) {
    super(model);
  }

  toDomain(doc: ReportDoc): ReportEntity {
    const result = ReportEntity.create(
      {
        tenantId: doc.tenantId,
        projectId: doc.projectId,
        groupId: doc.groupId,
        slug: doc.slug,
        title: doc.title,
        subtitle: doc.subtitle,
        label: doc.label,
        featureId: doc.featureId,
        module: doc.module,
        statusVariant: doc.statusVariant as FeatureStatus,
        owner: doc.owner,
        reported: doc.reported,
        sections: doc.sections ?? [],
        order: doc.order,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  toDocument(report: ReportEntity): Partial<ReportDoc> {
    return {
      _id: report.id.toString(),
      tenantId: report.tenantId,
      projectId: report.projectId,
      groupId: report.groupId,
      slug: report.slug,
      title: report.title,
      subtitle: report.subtitle,
      label: report.label,
      featureId: report.featureId,
      module: report.module,
      statusVariant: report.statusVariant,
      owner: report.owner,
      reported: report.reported,
      sections: report.sections,
      order: report.order,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  async findById(id: string): Promise<ReportEntity | null> {
    const doc = await this.model.findById(id).lean<ReportDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByProject(
    tenantId: string,
    projectId: string,
    groupId?: string,
  ): Promise<ReportEntity[]> {
    const filter: Record<string, unknown> = { tenantId, projectId };
    if (groupId) filter.groupId = groupId;
    const docs = await this.model
      .find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean<ReportDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findByCaseShortId(
    tenantId: string,
    projectId: string,
    shortId: string,
  ): Promise<ReportEntity | null> {
    const doc = await this.model
      .findOne({ tenantId, projectId, 'sections.cases.shortId': shortId })
      .lean<ReportDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async existsBySlug(
    tenantId: string,
    projectId: string,
    slug: string,
  ): Promise<boolean> {
    const count = await this.model
      .countDocuments({ tenantId, projectId, slug })
      .exec();
    return count > 0;
  }

  async countByProject(tenantId: string, projectId: string): Promise<number> {
    return this.model.countDocuments({ tenantId, projectId }).exec();
  }

  async statsForProjects(
    tenantId: string,
    projectIds: string[],
  ): Promise<ProjectReportStats[]> {
    const rows = await this.model
      .aggregate<{ _id: string; statuses: { status: FeatureStatus; n: number }[] }>([
        { $match: { tenantId, projectId: { $in: projectIds } } },
        {
          $group: {
            _id: { projectId: '$projectId', status: '$statusVariant' },
            n: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.projectId',
            statuses: { $push: { status: '$_id.status', n: '$n' } },
          },
        },
      ])
      .exec();

    const byProject = new Map<string, ProjectReportStats>();
    for (const id of projectIds) {
      byProject.set(id, {
        projectId: id,
        total: 0,
        done: 0,
        testing: 0,
        info: 0,
      });
    }
    for (const row of rows) {
      const stats = byProject.get(row._id);
      if (!stats) continue;
      for (const s of row.statuses) {
        stats.total += s.n;
        if (s.status === FeatureStatus.DONE) stats.done += s.n;
        else if (s.status === FeatureStatus.TESTING) stats.testing += s.n;
        else if (s.status === FeatureStatus.INFO) stats.info += s.n;
      }
    }
    return Array.from(byProject.values());
  }

  async save(report: ReportEntity): Promise<void> {
    const doc = this.toDocument(report);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }

  async update(report: ReportEntity): Promise<void> {
    await this.save(report);
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }
}
