import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { ITeamRepository } from '@application/teams/repositories/team.repository';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TeamIssueType } from '@application/teams/domain/enums/team.enums';
import { TeamDoc } from '../entities/team.schema';

@Injectable()
export class TeamRepository implements ITeamRepository {
  constructor(@InjectModel('Team') private readonly model: Model<TeamDoc>) {}

  private toDomain(doc: TeamDoc): TeamEntity {
    const result = TeamEntity.create(
      {
        tenantId: doc.tenantId,
        key: doc.key,
        name: doc.name,
        issueType: doc.issueType as TeamIssueType,
        icon: doc.icon,
        color: doc.color ?? null,
        statuses: doc.statuses,
        archived: doc.archived,
        order: doc.order,
        publicEnabled: doc.publicEnabled ?? false,
        publicToken: doc.publicToken ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  private toDocument(team: TeamEntity): Partial<TeamDoc> {
    return {
      _id: team.id.toString(),
      tenantId: team.tenantId,
      key: team.key,
      name: team.name,
      issueType: team.issueType,
      icon: team.icon,
      color: team.color,
      statuses: team.ownStatuses,
      archived: team.archived,
      order: team.order,
      publicEnabled: team.publicEnabled,
      publicToken: team.publicToken,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  async findByTenant(tenantId: string): Promise<TeamEntity[]> {
    const docs = await this.model
      .find({ tenantId })
      .sort({ order: 1, createdAt: 1 })
      .lean<TeamDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findById(tenantId: string, id: string): Promise<TeamEntity | null> {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean<TeamDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByKey(tenantId: string, key: string): Promise<TeamEntity | null> {
    const doc = await this.model.findOne({ tenantId, key }).lean<TeamDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findByPublicToken(token: string): Promise<TeamEntity | null> {
    const doc = await this.model
      .findOne({ publicToken: token, publicEnabled: true })
      .lean<TeamDoc>()
      .exec();
    return doc ? this.toDomain(doc) : null;
  }

  async tenantIdsWithTeams(): Promise<string[]> {
    return (await this.model.distinct('tenantId').exec()) as string[];
  }

  async save(team: TeamEntity): Promise<void> {
    const doc = this.toDocument(team);
    await this.model
      .findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true, new: true })
      .exec();
  }
}
