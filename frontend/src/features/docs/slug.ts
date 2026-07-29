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

/**
 * A doc's handle in a URL: its ref (`DOC-6HCUHKX`) once it has one, its uuid
 * until then. Docs written before refs existed keep addressing by id — the API
 * resolves either — so this degrades quietly instead of producing a dead link.
 */
export function docKey(doc: { id: string; ref?: string }): string {
  return doc.ref || doc.id;
}

/**
 * The canonical detail URL — `/docs/DOC-6HCUHKX/getting-started-622436d1`.
 * Both halves are readable and neither is a uuid, which is the whole point:
 * these get pasted into chat and read aloud.
 */
export function docPath(
  doc: { id: string; ref?: string },
  page?: { id: string; title: string } | null,
): string {
  const base = `/docs/${docKey(doc)}`;
  return page ? `${base}/${pageSlug(page)}` : base;
}
