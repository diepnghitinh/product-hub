/**
 * Where the document lives inside the Y.Doc is *not* declared here — it is
 * `BLOCKS_KEY` in `blockDoc.ts`, the module this server shares verbatim with the
 * browser. One definition, copied rather than restated, because a second copy of
 * a key like this fails silently: both sides read an empty document and nothing
 * errors.
 *
 * `DOC_FRAGMENT` is what the BlockNote build used. It is kept only so the
 * superseded `blocknote.ts` still compiles; nothing on the live path reads it.
 */
export const DOC_FRAGMENT = 'prosemirror';

/**
 * A room is `<tenantId>:<pageId>`. The tenant is in the name *and* checked
 * against the caller's token, so guessing a page id from another workspace
 * can't open its document.
 */
export const ROOM_SEPARATOR = ':';

/** Mongo collections owned by the API (Mongoose model name → lowercased plural). */
export const PAGES_COLLECTION = 'docpages';

/** Ours: one row per page holding the Yjs update log. */
export const CRDT_COLLECTION = 'docpagecrdts';
