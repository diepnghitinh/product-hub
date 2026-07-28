/** What kind of thing was uploaded. Each kind has its own size cap in the tenant config. */
export enum UploadKind {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
}

/**
 * The document types a doc page can carry, keyed by file extension. The
 * extension is the source of truth for the *stored* content type — see
 * `classifyUpload` — so this map is deliberately closed: anything not listed
 * here is not a document.
 */
export const DOCUMENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
};

/** Every content type the map above can produce — used for files with no extension. */
const DOCUMENT_TYPES = new Set(Object.values(DOCUMENT_TYPE_BY_EXT));

/** What the file picker should offer, so the dialog matches what the API accepts. */
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPE_BY_EXT)
  .map((ext) => `.${ext}`)
  .join(',');

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > -1 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Decide what a file is, and what content type it should be *stored* under.
 *
 * For documents the extension wins over the browser's claim, and the stored type
 * comes from the map rather than the request. That matters because uploads are
 * served from a public URL: a file called `spec.pdf` sent as `text/html` would
 * otherwise be stored — and later served — as a web page on the storage domain.
 *
 * Returns `null` when the file is nothing we accept.
 */
export function classifyUpload(
  contentType: string,
  filename: string,
): { kind: UploadKind; contentType: string } | null {
  const documentType = DOCUMENT_TYPE_BY_EXT[extensionOf(filename)];
  if (documentType) return { kind: UploadKind.DOCUMENT, contentType: documentType };
  if (contentType.startsWith('video/')) return { kind: UploadKind.VIDEO, contentType };
  if (contentType.startsWith('image/')) return { kind: UploadKind.IMAGE, contentType };
  if (DOCUMENT_TYPES.has(contentType)) return { kind: UploadKind.DOCUMENT, contentType };
  return null;
}
