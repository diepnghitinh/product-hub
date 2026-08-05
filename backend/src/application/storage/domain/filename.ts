/**
 * Everything about the *name* of an uploaded file: how it arrives, how it goes
 * into a storage key, and how it comes back out on a download.
 *
 * A file called `Báo cáo tháng 7 (đã duyệt).xlsx` has to survive three hops
 * that all default to ASCII-or-nothing, and each one needs a different rule.
 */

/**
 * Repair a filename that was decoded as latin1 when it was really UTF-8.
 *
 * `multipart/form-data` carries no charset for a part header, so RFC 7578 says
 * to assume the enclosing document's — which nobody can know server-side.
 * busboy (and therefore multer, and therefore Nest's `FileInterceptor`) picks
 * `latin1`, so `Báo cáo.xlsx` arrives as `BÃ¡o cÃ¡o.xlsx`: each UTF-8 byte read
 * as its own character. Uploads now set `defParamCharset: 'utf8'`, which is the
 * real fix; this exists because names stored *before* that are still mojibake,
 * and one rule should repair them wherever they turn up.
 *
 * Deliberately conservative — a name is only rewritten when its latin1 bytes
 * are valid UTF-8 *and* re-encoding reproduces the input exactly. A name that
 * was already correct fails that test (`á` alone is not a valid UTF-8 lead
 * byte followed by a continuation byte) and is returned untouched.
 */
export function decodeMultipartFilename(name: string): string {
  // Pure ASCII can't be mojibake, and has nothing to repair.
  if (!name || !/[\u0080-\u00ff]/.test(name)) return name;
  const bytes = Buffer.from(name, 'latin1');
  const decoded = bytes.toString('utf8');
  // U+FFFD means the bytes weren't UTF-8 after all — the name is genuinely
  // latin1 and must be left alone.
  if (decoded.includes('\ufffd')) return name;
  // `Buffer.from(…, 'latin1')` truncates anything above U+00FF to its low byte,
  // so a name with real non-latin1 characters (`ạ`, `한`) would decode to
  // nonsense. Round-tripping catches exactly that case.
  if (Buffer.from(decoded, 'utf8').toString('latin1') !== name) return name;
  return decoded;
}

/**
 * The tail of a filename, flattened to what's safe in a storage object key.
 *
 * The key is ASCII on purpose — it ends up inside a URL that is stored, shared,
 * signed and logged, and S3/Azure only guarantee "safe characters". Vietnamese
 * and other Latin diacritics are *transliterated* rather than dropped, so
 * `Báo cáo tháng 7.xlsx` keys as `Bao-cao-thang-7.xlsx` instead of `-7.xlsx`;
 * the display name is kept verbatim on the record either way.
 */
export function storageKeySlug(originalName: string): string {
  const flattened = originalName
    .normalize('NFD') // ế → e + ◌́
    .replace(/[\u0300-\u036f]/g, '') // …then drop the accent
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D'); // Vietnamese đ has no decomposition
  // Keep the tail, so the extension survives a very long name.
  return flattened.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80) || 'file';
}

/** Longest filename we'll echo back in a header — well past any real name. */
const MAX_DOWNLOAD_NAME = 260;

/**
 * Build a `Content-Disposition` value that saves under the real name.
 *
 * The plain `filename=` parameter is latin1 by spec, and Node throws
 * `ERR_INVALID_CHAR` outright for a header holding anything above U+00FF — so
 * emitting a Vietnamese name that way doesn't mangle the download, it fails the
 * request with a 500. RFC 6266/5987's `filename*=UTF-8''…` carries it properly;
 * the ASCII `filename=` stays as the fallback for anything that doesn't read it.
 *
 * Both forms are stripped of anything that could close the quoted string or
 * start a new header line — this value comes from a client-supplied `?name=`.
 */
export function contentDispositionHeader(
  disposition: 'inline' | 'attachment',
  name: string,
): string {
  const trimmed = name.trim().slice(0, MAX_DOWNLOAD_NAME);
  const ascii =
    trimmed
      .replace(/[^\x20-\x7e]+/g, '_') // non-ASCII *and* CR/LF/control
      .replace(/["\\]/g, '')
      .trim() || 'download';
  // encodeURIComponent leaves ! ' ( ) * — percent-encode those too, since the
  // extended form is a token, not a quoted string.
  const encoded = encodeURIComponent(trimmed).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
