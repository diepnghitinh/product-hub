/** How many characters of a page's id identify it inside a URL. */
const KEY_LEN = 8;

/**
 * A page's handle in a link: `research-notes-622436d1`. The words are there so
 * the URL says where it points; the id suffix is what actually resolves it,
 * which is why renaming a page never breaks a link that's already been sent.
 */
export function pageSlug(page: { id: string; title: string }): string {
  const words = page.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  const key = page.id.slice(0, KEY_LEN);
  return words ? `${words}-${key}` : key;
}

/**
 * The page a slug points at, matched on its trailing id — so a slug written
 * before a rename still lands. Null when nothing matches (a deleted page, or a
 * hand-edited URL); callers fall back to the doc's first page.
 */
export function pageFromSlug<T extends { id: string }>(
  pages: readonly T[],
  slug: string,
): T | null {
  const key = (slug.split('-').pop() ?? '').toLowerCase();
  if (!key) return null;
  return pages.find((p) => p.id.slice(0, KEY_LEN).toLowerCase() === key) ?? null;
}
