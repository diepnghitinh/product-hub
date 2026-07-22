import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { Role } from '@core/interfaces';
import { FavouriteKind } from '@application/favourites/domain/favourite-kind.enum';
import { FavouriteRef } from '@application/favourites/domain/favourite.ref';
import { TaskStatusConfig } from '@application/tasks/domain/enums/task.enums';

export interface UserDoc {
  _id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  inboxSeenAt: Date | null;
  favourites: FavouriteRef[];
  personalStatuses: TaskStatusConfig[];
  readInboxKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** A pinned entity, stored inline on the user (a small, bounded per-user list). */
const FavouriteRefSchema = new Schema<FavouriteRef>(
  {
    kind: { type: String, enum: Object.values(FavouriteKind), required: true },
    refId: { type: String, required: true },
    title: { type: String, required: true },
    roadmapId: { type: String, default: undefined },
    teamId: { type: String, default: undefined },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

/** One column of a user's private personal board, stored inline on the user. */
const PersonalStatusSchema = new Schema<TaskStatusConfig>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, required: true },
  },
  { _id: false },
);

export const UserSchema = new Schema<UserDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    // Email is globally unique so login can resolve the tenant from the account.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 190,
    },
    name: { type: String, required: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(Role), default: Role.TESTER },
    inboxSeenAt: { type: Date, default: null },
    favourites: { type: [FavouriteRefSchema], default: [] },
    // Empty by default; the entity fills in DEFAULT_TASK_STATUSES on read so an
    // account that predates this field still gets the three starter columns.
    personalStatuses: { type: [PersonalStatusSchema], default: [] },
    readInboxKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);
