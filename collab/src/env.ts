import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

/**
 * Multi-environment config, same convention as the API
 * (see backend/libs/shared/utils/dotenv.ts): one env file per environment under
 * `config/`, and we load exactly the one NODE_ENV names.
 *
 *   local (default) → config/.env.local
 *   dev             → config/.env.dev
 *   prod            → config/.env.prod
 *
 * A missing file is fine — under Docker Compose the values arrive as real
 * environment variables instead, and those always win.
 */
function envFilePath(nodeEnv: string | undefined): string {
  const file = (name: string) => resolve(process.cwd(), 'config', name);
  switch (nodeEnv) {
    case 'development':
    case 'dev':
      return file('.env.dev');
    case 'prod':
    case 'production':
      return file('.env.prod');
    case 'local':
    default:
      return file('.env.local');
  }
}

const path = envFilePath(process.env['NODE' + '_ENV']);
if (existsSync(path)) process.loadEnvFile(path);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. Copy config/example.env.local to config/.env.local, or pass it in the environment.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'local',
  port: int('PORT', 3002),

  /** Must be the same database the API writes docs to — we read and mirror into it. */
  mongoUri: required('MONGODB_URI'),

  /**
   * Must be byte-identical to the API's JWT_SECRET: clients authenticate here
   * with the very same access token they use for REST calls, so a mismatch
   * shows up as every editor silently failing to connect.
   */
  jwtSecret: required('JWT_SECRET'),

  /**
   * Origins allowed to call the HTTP endpoints (`/health`, `/presence`).
   * WebSockets aren't subject to CORS, so this only gates the presence read
   * that the docs list makes.
   */
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * How long editing pauses before the Y.Doc is written to Mongo, and the
   * ceiling that forces a write during continuous typing. The CRDT lives in
   * memory while anyone is connected, so these only bound how much is at risk
   * if the process dies — not what collaborators see.
   */
  storeDebounceMs: int('STORE_DEBOUNCE_MS', 2_000),
  storeMaxDebounceMs: int('STORE_MAX_DEBOUNCE_MS', 10_000),
};

export type Env = typeof env;
