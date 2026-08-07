/**
 * Git branch names for issues.
 *
 * Every issue *has* a branch name whether or not anyone chose one: by default it
 * is derived from the ref and the title (`tsk-6hcuhkx-wire-up-the-import-parser`),
 * which is what the copy button hands you. A team that names branches its own way
 * can override it — that override is the only thing stored, so an issue nobody has
 * renamed keeps following its title for free and needed no migration.
 *
 * The rules here mirror `frontend/src/features/issues/refs.ts`. Both sides slug the
 * same way on purpose: the client shows what will be saved as you type, and the
 * server is what actually decides — a name that arrives from MCP or curl is held to
 * exactly the same shape.
 */

/** How much of the title a derived branch name carries before it's cut. */
const SLUG_MAX = 44;

/** Longest branch name we'll store. Well under any git limit; long enough for a
 *  prefix, a ref and a sentence of title. */
export const BRANCH_NAME_MAX = 120;

/**
 * A title reduced to `lower-case-words`, with accents folded first.
 *
 * The fold matters here: a title written in Vietnamese ("Sửa lỗi import") would
 * otherwise strip to nothing, since every accented letter is outside `a-z`. `NFD`
 * splits each one into its base letter plus a combining mark, so dropping the marks
 * leaves "sua-loi-import". `đ` has no decomposition and is mapped by hand.
 */
function slugWords(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}

/** The name an issue carries when nobody has chosen one — ref first, so branches
 *  sort and grep by issue and any tooling has a fixed place to look for the ref. */
export function derivedBranchName(ref: string, title: string): string {
  const head = ref.toLowerCase();
  const words = slugWords(title);
  return words ? `${head}-${words}` : head;
}

/**
 * What a typed branch name becomes once it's safe for `git branch`.
 *
 * An allowlist rather than a list of git's forbidden sequences: keeping only
 * `[a-z0-9._/-]` rules out `..`, `~^:?*[`, `@{`, spaces and control characters in
 * one move, and the tidy-up afterwards handles the positional rules (no leading or
 * trailing separator, no `//`, no `.lock` suffix). Case is folded because the
 * derived name is lowercase and two names differing only in case would read as the
 * same branch to everyone but git.
 *
 * Returns '' when nothing usable survives — the caller treats that as "no override".
 */
export function normalizeBranchName(input: string): string {
  const slug = (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/\.{2,}/g, '.')
    .slice(0, BRANCH_NAME_MAX)
    .replace(/^[-._/]+|[-._/]+$/g, '');
  // `foo.lock` is reserved by git for the lockfile beside a ref of that name.
  return slug.endsWith('.lock') ? slug.slice(0, -'.lock'.length).replace(/[-._/]+$/, '') : slug;
}
