import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { Role } from '@core/interfaces';
import { FavouriteKind } from '@application/favourites/domain/favourite-kind.enum';
import { FavouriteRef } from '@application/favourites/domain/favourite.ref';

export interface UserDoc {
  _id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  inboxSeenAt: Date | null;
  favourites: FavouriteRef[];
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
    readInboxKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);
