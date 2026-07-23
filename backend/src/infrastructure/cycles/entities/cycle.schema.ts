import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';

export interface CycleDoc {
  _id: string;
  tenantId: string;
  teamId: string;
  number: number;
  startDate: string;
  endDate: string;
  scopeCount: number;
  scopePoints: number;
  completedCount: number;
  completedPoints: number;
  unfinishedIds: string[];
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CycleSchema = new Schema<CycleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    teamId: { type: String, required: true, index: true },
    number: { type: Number, required: true },
    // ISO YYYY-MM-DD, inclusive — the issue date convention, sortable as strings.
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    // Frozen at boundary processing; 0 until then (live rollups are read-side).
    scopeCount: { type: Number, default: 0 },
    scopePoints: { type: Number, default: 0 },
    completedCount: { type: Number, default: 0 },
    completedPoints: { type: Number, default: 0 },
    // Frozen with the stats: the issue ids the boundary sweep moved away —
    // the "planned here but unfinished" list a closed board would otherwise
    // lose. Stays [] on cycles closed before this field existed.
    unfinishedIds: { type: [String], default: [] },
    // Set once when the boundary is processed — also the write-once claim that
    // keeps two concurrent scheduler runs from both freezing stats.
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Generation is deterministic per team; this makes a concurrent duplicate a no-op.
CycleSchema.index({ teamId: 1, number: 1 }, { unique: true });
