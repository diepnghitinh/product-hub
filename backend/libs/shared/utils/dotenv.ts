import { config } from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import { resolve } from 'path';
import { cwd, env } from 'process';
import { ConfigService } from '@nestjs/config';

/**
 * Multi-environment config loader (concept mirrored from ref-backend/config).
 *
 * Instead of a single root `.env`, the backend keeps one env file per
 * environment under a top-level `config/` folder and loads exactly the one that
 * matches NODE_ENV — so local / dev / prod settings live side by side without
 * clobbering each other:
 *
 *   local (default) → config/.env.local
 *   dev             → config/.env.dev
 *   prod            → config/.env.prod
 *
 * Import this module for its side effect (`import '@shared/utils/dotenv';`) at
 * the very top of any entry point that reads env *before* Nest boots — the main
 * bootstrap and the migration scripts. Nest's ConfigModule also points at the
 * same file (see app.module), so ConfigService stays the source of truth inside
 * the app.
 */
export const getEnvFilePath = (nodeEnv?: string): string => {
  const joinPath = (fileName: string) => resolve(cwd(), 'config', fileName);
  switch (nodeEnv) {
    case 'development':
    case 'dev':
      return joinPath('.env.dev');
    case 'prod':
    case 'production':
      return joinPath('.env.prod');
    case 'local':
    default:
      return joinPath('.env.local');
  }
};

// Read NODE_ENV via a dynamic key (not the literal `process.env.NODE_ENV`) so
// the `nest build` bundler can't statically inline the value at build time.
const NODE_ENV = env['NODE' + '_ENV'];

// Side effect: load the chosen file into process.env now. `${VAR}` references are
// expanded, and a real shell env var always wins (dotenv never overrides an
// already-set value). A missing file is a no-op — the app falls back to the
// legacy root `.env` (kept in ConfigModule's envFilePath) and to real env vars.
dotenvExpand.expand(config({ path: getEnvFilePath(NODE_ENV), quiet: true }));

/** A ConfigService usable OUTSIDE Nest's DI — e.g. inside migration scripts. */
export const utilConfigService = new ConfigService();
