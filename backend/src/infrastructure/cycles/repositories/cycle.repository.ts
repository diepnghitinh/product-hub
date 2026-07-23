import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniqueEntityID } from '@core/domain';
import { ICycleRepository } from '@application/cycles/repositories/cycle.repository';
import { CycleEntity } from '@application/cycles/domain/entities/cycle.entity';
import { CycleRollup } from '@application/cycles/domain/enums/cycle.enums';
import { CycleDoc } from '../entities/cycle.schema';

@Injectable()
export class CycleRepository implements ICycleRepository {
  constructor(@InjectModel('Cycle') private readonly model: Model<CycleDoc>) {}

  private toDomain(doc: CycleDoc): CycleEntity {
    const result = CycleEntity.create(
      {
        tenantId: doc.tenantId,
        teamId: doc.teamId,
        number: doc.number,
        startDate: doc.startDate,
        endDate: doc.endDate,
        scopeCount: doc.scopeCount,
        scopePoints: doc.scopePoints,
        completedCount: doc.completedCount,
        completedPoints: doc.completedPoints,
        unfinishedIds: doc.unfinishedIds ?? [],
        closedAt: doc.closedAt ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      new UniqueEntityID(doc._id),
    );
    if (result.isFailure) throw new Error(result.error as string);
    return result.getValue();
  }

  async findByTeam(tenantId: string, teamId: string): Promise<CycleEntity[]> {
    const docs = await this.model
      .find({ tenantId, teamId })
      .sort({ number: 1 })
      .lean<CycleDoc[]>()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findById(tenantId: string, id: string): Promise<CycleEntity | null> {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean<CycleDoc>().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async insert(cycle: CycleEntity): Promise<boolean> {
    try {
      await this.model.create({
        _id: cycle.id.toString(),
        tenantId: cycle.tenantId,
        teamId: cycle.teamId,
        number: cycle.number,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        scopeCount: cycle.scopeCount,
        scopePoints: cycle.scopePoints,
        completedCount: cycle.completedCount,
        completedPoints: cycle.completedPoints,
        unfinishedIds: cycle.unfinishedIds,
        closedAt: cycle.closedAt,
      });
      return true;
    } catch (err) {
      // E11000 on (teamId, number): a concurrent run generated the same cycle.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  async closeCycle(tenantId: string, id: string, rollup: CycleRollup, at: Date): Promise<boolean> {
    // First-writer-wins: only the run that flips closedAt writes the history.
    // unfinishedIds rides the same write, so the who-left record is atomic
    // with the frozen stats it must agree with.
    const res = await this.model
      .updateOne(
        { _id: id, tenantId, closedAt: null },
        {
          $set: {
            scopeCount: rollup.scopeCount,
            scopePoints: rollup.scopePoints,
            completedCount: rollup.completedCount,
            completedPoints: rollup.completedPoints,
            unfinishedIds: rollup.unfinishedIds,
            closedAt: at,
          },
        },
      )
      .exec();
    return (res.modifiedCount ?? 0) > 0;
  }

  async deleteUpcoming(tenantId: string, teamId: string, today: string): Promise<string[]> {
    const docs = await this.model
      .find({ tenantId, teamId, startDate: { $gt: today } }, { _id: 1 })
      .lean<{ _id: string }[]>()
      .exec();
    const ids = docs.map((d) => d._id);
    if (ids.length) await this.model.deleteMany({ _id: { $in: ids }, tenantId }).exec();
    return ids;
  }
}
