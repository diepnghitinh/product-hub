/**
 * A file in the tenant's cloud storage, as recorded on whatever it's attached to
 * — a backlog item, an issue, a doc page. It's a *snapshot* of the upload
 * result, not a reference to a file record: the bytes live in the bucket and
 * this is everything a list needs to show an icon, a name and a size without a
 * HEAD request.
 *
 * `contentType` is what the upload settled on (see `classifyUpload` — extension
 * first), which is also what the viewer keys off to decide how to render it.
 *
 * The same four fields as `DocAttachment` and `BugAttachment`, which predate
 * this and are structurally identical; new attachment surfaces point here.
 */
export interface StoredFile {
  /** Public URL of the stored file. */
  url: string;
  /** Original filename — the chip's label and the download name. */
  name: string;
  /** Stored MIME type. */
  contentType: string;
  /** Bytes. */
  size: number;
}

/** Nobody needs more than this on one thing, and a list this long is a bug or
 *  an abuse rather than a use case. */
export const MAX_ATTACHMENTS = 25;

/**
 * Coerce whatever a client sent into a clean list of attachments.
 *
 * Needed where the payload isn't validated field-by-field — a roadmap's items
 * are replaced wholesale as free-form objects, so this is the only thing
 * standing between the request and a stored `url`. A URL is rendered as a link
 * and handed to the file viewer, so only `http`/`https` survive: a
 * `javascript:` one would be stored XSS on whoever opened the item next.
 */
export function sanitizeStoredFiles(input: unknown): StoredFile[] {
  if (!Array.isArray(input)) return [];
  const clean: StoredFile[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const file = raw as Partial<StoredFile>;
    if (typeof file.url !== 'string') continue;
    let parsed: URL;
    try {
      parsed = new URL(file.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
    clean.push({
      url: file.url,
      name: String(file.name ?? '').slice(0, 260) || 'file',
      contentType: String(file.contentType ?? '').slice(0, 160),
      size: Number.isFinite(file.size) ? Math.max(0, Number(file.size)) : 0,
    });
    if (clean.length >= MAX_ATTACHMENTS) break;
  }
  return clean;
}
