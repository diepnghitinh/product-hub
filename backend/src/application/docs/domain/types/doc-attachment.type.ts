/**
 * A file attached to a doc page — a spec, a deck, a spreadsheet. Stored as a
 * snapshot of the upload result rather than a reference to a file record: the
 * bytes live in the tenant's cloud storage and this is everything needed to list
 * and download them, in the same spirit as `DocLinkRef`.
 *
 * `contentType` and `size` are what the *upload* settled on (see
 * `classifyUpload`), so the chip can pick an icon and show a size without a HEAD
 * request — which matters most on the public view, where there's no session to
 * make one with.
 */
export interface DocAttachment {
  /** Public URL of the stored file. */
  url: string;
  /** Original filename, shown on the chip and used for the download. */
  name: string;
  /** Stored MIME type — drives the icon. */
  contentType: string;
  /** Bytes. */
  size: number;
}
