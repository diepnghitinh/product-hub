import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema } from 'mongoose';

export interface CounterDoc {
  /** `<tenantId>:<prefix>`, e.g. `t_123:BUG`. */
  _id: string;
  seq: number;
}

export const CounterSchema = new Schema<CounterDoc>({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

/**
 * Per-tenant sequence for human-friendly short ids (`BUG-12`, `TSK-7`).
 *
 * A single atomic `findOneAndUpdate($inc)` hands out each number, so two
 * simultaneous creates can never receive the same one. Sequences are per
 * tenant *and* per prefix, so every workspace starts at 1 and bugs/tasks
 * number independently. Gaps are expected and fine — a number is burned if the
 * create that claimed it later fails.
 */
@Injectable()
export class CounterService {
  constructor(@InjectModel('Counter') private readonly model: Model<CounterDoc>) {}

  /** Next number in the tenant's sequence for `prefix`. */
  async next(tenantId: string, prefix: string): Promise<number> {
    const doc = await this.model
      .findByIdAndUpdate(
        `${tenantId}:${prefix}`,
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<CounterDoc>()
      .exec();
    return doc?.seq ?? 1;
  }

  /** Next short id, e.g. `BUG-12`. */
  async nextShortId(tenantId: string, prefix: string): Promise<string> {
    return `${prefix}-${await this.next(tenantId, prefix)}`;
  }

  /**
   * Seeds the sequence so it never re-issues a number already in use — used by
   * the backfill, which assigns ids to rows created before short ids existed.
   */
  async ensureAtLeast(tenantId: string, prefix: string, value: number): Promise<void> {
    await this.model
      .findByIdAndUpdate(
        `${tenantId}:${prefix}`,
        { $max: { seq: value } },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
