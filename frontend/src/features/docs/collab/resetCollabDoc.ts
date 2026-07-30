/**
 * Tell the sync server to re-read a page from the database.
 *
 * There is exactly one caller: restoring a version. The API writes the restored
 * body to `docpages.content` as it always has, but while anyone is connected the
 * Y.Doc — not that column — is what they are looking at, and the next keystroke
 * would mirror the old text straight back over the restore.
 *
 * So the server applies the stored HTML to the live room as Yjs operations, which
 * everybody receives as an ordinary update: the page changes under the cursor,
 * for everyone, with no reload and nothing to reconcile on this side.
 */
import { getToken } from '@/lib/api';
import { collabHttpUrl } from '@/lib/env';

export async function resetCollabDoc(pageId: string): Promise<void> {
  const token = getToken();
  const url = collabHttpUrl(`/reset?page=${encodeURIComponent(pageId)}`);
  if (!url || !token) return;

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`collab reset failed: ${response.status}`);
}
