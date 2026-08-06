/** How much of the title a branch name carries before it's cut. */
const SLUG_MAX = 44;

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
 * Ref first, so branches sort and grep by issue and so any tooling that wants to
 * find the issue from the branch has a fixed place to look. No `feature/` or
 * `fix/` prefix and no username — those are per-team conventions this product
 * has no opinion on, and a wrong guess is worse than a short name someone
 * prefixes themselves.
 *
 * The output is always safe for `git branch`: only `[a-z0-9-]` survives the
 * slug, with no leading dash, no `..`, and no trailing dot.
 */
export function issueBranchName(issue: { shortId?: string; id: string; title: string }): string {
  const ref = (issue.shortId || issue.id).toLowerCase();
  const words = slugWords(issue.title);
  return words ? `${ref}-${words}` : ref;
}
