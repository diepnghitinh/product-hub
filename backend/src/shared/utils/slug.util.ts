/**
 * Turn a human title into a URL-safe slug: lowercase, non-alphanumerics → dashes,
 * collapsed and trimmed. Falls back to `item` when nothing usable remains.
 */
export function slugify(text: string): string {
  const slug = (text || '')
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/**
 * Ensure a slug is unique by appending `-2`, `-3`, … until `exists` returns false.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}
