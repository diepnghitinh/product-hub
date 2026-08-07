/** How much of the title a branch name carries before it's cut. */
const SLUG_MAX = 44;

/** Longest branch name the API will store — the input stops you there rather than
 *  letting the server silently truncate. Mirrors `BRANCH_NAME_MAX` on the backend. */
export const BRANCH_NAME_MAX = 120;

/**
 * A title reduced to `lower-case-words`, with accents folded first.
 *
 * The fold matters here: a title written in Vietnamese ("Sửa lỗi import") would
 * otherwise strip to nothing, since every accented letter is outside `a-z`.
 * `NFD` splits each one into its base letter plus a combining mark, so dropping
 * the marks leaves "sua-loi-import". `đ` has no decomposition and is mapped by
 * hand. A title with no Latin letters at all (Korean, say) still slugs to '' —
 * callers fall back to the ref alone, which is a valid name on its own.
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

/**
 * The canonical detail path — `/issues/TSK-6HCUHKX`. One route serves both
 * kinds, so this never has to branch on task vs bug. Falls back to the uuid for
 * an issue minted before refs existed; the API resolves either.
 */
export function issuePath(issue: { shortId?: string; id: string }): string {
  return `/issues/${issue.shortId || issue.id}`;
}

/** The same path as something you can paste into chat — absolute, with origin. */
export function issueUrl(issue: { shortId?: string; id: string }): string {
  return new URL(issuePath(issue), window.location.origin).toString();
}

/**
 * A git branch name for an issue: `tsk-6hcuhkx-wire-up-the-import-parser`.
 *
 * Whatever the issue answers to. If someone renamed it, the API sends that back
 * as `branch` and it wins outright; otherwise the name is derived here, ref
 * first — so branches sort and grep by issue and any tooling that wants to find
 * the issue from the branch has a fixed place to look. No `feature/` or `fix/`
 * prefix and no username by default: those are per-team conventions this product
 * has no opinion on, and a wrong guess is worse than a short name someone
 * prefixes themselves (or now, renames once and for all).
 *
 * The derived output is always safe for `git branch`: only `[a-z0-9-]` survives
 * the slug, with no leading dash, no `..`, and no trailing dot.
 */
export function issueBranchName(issue: {
  shortId?: string;
  id: string;
  title: string;
  branch?: string;
}): string {
  if (issue.branch) return issue.branch;
  const ref = (issue.shortId || issue.id).toLowerCase();
  const words = slugWords(issue.title);
  return words ? `${ref}-${words}` : ref;
}

/**
 * The light filter a branch-name field applies **while you type**: fold accents,
 * lower-case, and turn anything git wouldn't take into `-`.
 *
 * Deliberately not the full {@link normalizeBranchName}. That one trims leading
 * and trailing separators, which is right for a finished name and impossible to
 * type through — every `/` and `-` would be eaten the instant you pressed it, so
 * `feat/my-branch` could never be entered at all. The edges are settled on blur
 * and again on save; until then the field lets you finish the word.
 */
export function typedBranchName(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .slice(0, BRANCH_NAME_MAX);
}

/**
 * What a typed branch name becomes once it's safe for `git branch` — the same
 * rules the API applies, so the field can settle to exactly what will be stored
 * rather than surprising you after the fact.
 *
 * An allowlist rather than a list of git's forbidden sequences: keeping only
 * `[a-z0-9._/-]` rules out `..`, `~^:?*[`, `@{`, spaces and control characters
 * in one move, and the tidy-up afterwards handles the positional rules (no
 * leading or trailing separator, no `//`, no `.lock` suffix). Case is folded
 * because the derived name is lowercase and two names differing only in case
 * would read as the same branch to everyone but git.
 *
 * Returns '' when nothing usable survives — which the editor reads as "go back
 * to the derived name", the same as the server does.
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
