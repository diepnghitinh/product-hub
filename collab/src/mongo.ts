import { Binary, MongoClient, type Collection, type Db } from 'mongodb';
import { CRDT_COLLECTION, DOCS_COLLECTION, PAGES_COLLECTION } from './constants.js';
import { env } from './env.js';
import { log } from './log.js';

/**
 * The slice of the API's `docpages` document this service touches. Deliberately
 * partial — we read `content` to seed a new Y.Doc and write it back as the
 * rendered mirror, and nothing else.
 */
export interface PageRow {
  _id: string;
  tenantId: string;
  docId: string;
  content?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
}

/**
 * The page's container, narrowed to the two fields that decide who may open the
 * room. `isPrivate` is absent on every doc written before the flag existed, hence
 * `boolean | undefined` — read it as false.
 */
export interface DocRow {
  _id: string;
  tenantId: string;
  createdBy?: string;
  isPrivate?: boolean;
}

/**
 * The Yjs state for one page. `state` is the full encoded update — not a diff —
 * so a load is a single read and there is no log to compact.
 */
export interface CrdtRow {
  _id: string;
  tenantId: string;
  docId: string;
  state: Binary;
  /** Bumped on every write; handy when debugging "did my keystroke land". */
  revision: number;
  updatedAt: Date;
}

let client: MongoClient | null = null;

export async function connectMongo(): Promise<Db> {
  client = new MongoClient(env.mongoUri, {
    // The whole service is one hot path (load → sync → store); failing fast is
    // better than holding a document open against a database we can't reach.
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  const db = client.db();
  await crdt(db).createIndex({ tenantId: 1, docId: 1 });
  log.info('mongo connected', { db: db.databaseName });
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
}

export const pages = (db: Db): Collection<PageRow> => db.collection<PageRow>(PAGES_COLLECTION);
export const crdt = (db: Db): Collection<CrdtRow> => db.collection<CrdtRow>(CRDT_COLLECTION);
export const docs = (db: Db): Collection<DocRow> => db.collection<DocRow>(DOCS_COLLECTION);
