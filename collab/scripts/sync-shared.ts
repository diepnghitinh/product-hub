/**
 * Copies the two modules the browser and this server *must* agree on.
 *
 *   frontend/src/lib/editorjs.ts                    → src/editorjs.ts
 *   frontend/src/features/docs/collab/blockDoc.ts   → src/blockDoc.ts
 *
 * Why a copy rather than a shared package: this service ships as its own
 * container with its own `package.json`, and its Docker build context is this
 * directory — it cannot reach up into the frontend at build time. A workspace
 * package would be the textbook answer and would also mean restructuring both
 * builds for two files.
 *
 * A copy is only safe if it cannot silently drift, which is what `--check` is
 * for: it fails when the generated file differs from the source, so `npm run
 * typecheck` (and anything running it) catches an edit made on one side only.
 *
 * Both files are copied verbatim. That is a constraint on the *sources*, not a
 * coincidence: `editorjs.ts` imports nothing and guards every DOM global it
 * touches, and `blockDoc.ts` imports only `yjs`. Keep them that way — see
 * `src/dom.ts` for the four globals this side has to provide.
 *
 *   npm run sync          rewrite the copies
 *   npm run sync -- --check   fail if they're out of step
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

interface Shared {
  from: string;
  to: string;
}

const SHARED: Shared[] = [
  { from: '../../frontend/src/lib/editorjs.ts', to: '../src/editorjs.ts' },
  { from: '../../frontend/src/features/docs/collab/blockDoc.ts', to: '../src/blockDoc.ts' },
];

const banner = (from: string): string =>
  [
    '/* GENERATED FILE — do not edit here.',
    ' *',
    ` * Copied verbatim from ${from.replace('../../', '')} by \`npm run sync\`.`,
    ' * Edit the source, run the script, commit both. `npm run typecheck` fails if',
    ' * this copy and its source have drifted.',
    ' */',
    '',
  ].join('\n');

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  let stale = 0;

  for (const { from, to } of SHARED) {
    const source = await readFile(path(from), 'utf8');
    const expected = `${banner(from)}${source}`;
    const current = await readFile(path(to), 'utf8').catch(() => null);

    if (current === expected) continue;
    if (check) {
      console.error(`out of step: ${to} ← ${from}`);
      stale += 1;
      continue;
    }
    await writeFile(path(to), expected, 'utf8');
    console.log(`synced ${to}`);
  }

  if (stale) {
    console.error(`\n${stale} file(s) out of step — run \`npm run sync\` in collab/.`);
    process.exit(1);
  }
  if (!check) console.log('shared modules in step');
}

void main();
