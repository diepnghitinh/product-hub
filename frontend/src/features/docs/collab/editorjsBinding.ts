/**
 * Editor.js ⇄ Yjs.
 *
 * The piece that doesn't exist as a library: BlockNote has `withCollaboration`,
 * ProseMirror has y-prosemirror, Editor.js has nothing. This is that binding —
 * one document, two directions, written against the shape in `blockDoc.ts`.
 *
 * Two directions, deliberately different in kind:
 *
 *  **Editor.js → Y**  Text is pushed on `input`, *synchronously*, straight off
 *  the DOM. That is the whole reason keystrokes aren't lost: the moment the DOM
 *  is ahead of the CRDT is the moment a remote update can arrive and overwrite
 *  it, so that moment is kept at zero. Structure (blocks added, removed, moved,
 *  converted) and the JSON half of a block's data come from `editor.save()`,
 *  which is async — and is re-run if a remote update lands while it's in flight,
 *  so a stale snapshot can never revert somebody else's edit.
 *
 *  **Y → Editor.js**  A text change is written into the editable element in
 *  place, with the caret mapped across the edit — no re-render, because
 *  re-rendering a block is what makes a collaborative editor feel like it's
 *  fighting you. Only structural changes go through the Editor.js API, and those
 *  are queued so two of them can't interleave.
 *
 * Every write in both directions is a *diff*, so any pass that runs twice is a
 * no-op the second time. That property is what keeps the two loops from
 * chasing each other.
 *
 * One rule underpins both directions, and it is the one worth remembering: **a
 * block the CRDT has never held is not a block somebody deleted.** An editor
 * always has blocks the document doesn't yet — the empty paragraph Editor.js
 * mounts with, a block typed a moment ago — and treating either side's list as
 * the whole truth is how a page loses text. So `known` records every id the
 * document has actually carried; only those may be deleted on either side.
 */
import type EditorJS from '@editorjs/editorjs';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  applyTextDiff,
  fromYBlock,
  readBlocks,
  sameData,
  textFieldsOf,
  textOf,
  toYBlock,
  type StoredBlock,
  type YBlock,
  type YBlocks,
} from './blockDoc';
import {
  blockElementOf,
  caretOffset,
  isTextarea,
  plainText,
  setCaretOffset,
  textHolders,
  type TextHolder,
} from './domText';

interface Options {
  editor: EditorJS;
  blocks: YBlocks;
  /** The element the editor renders into — where `input` is listened for. */
  holder: HTMLElement;
  /** Called after a remote change lands, so the page can re-measure overlays. */
  onRemote?: () => void;
}

export interface EditorJsBinding {
  /** Editor.js changed: reconcile structure and data into the CRDT. */
  pull: () => void;
  destroy: () => void;
}

/** What `editor.blocks.getBlockByIndex` hands back — Editor.js's block handle. */
type BlockHandle = ReturnType<EditorJS['blocks']['getBlockByIndex']>;

const valueOf = (el: TextHolder): string =>
  isTextarea(el) ? el.value : (el as HTMLElement).innerHTML;

/**
 * Where offset `at` in `before` ends up in `after`.
 *
 * The same prefix/suffix reasoning `applyTextDiff` uses, run backwards: text
 * typed *before* the caret pushes it along, text typed after it leaves it alone,
 * and an edit that spans it leaves the caret at the near edge of the change
 * rather than somewhere arbitrary.
 */
function mapOffset(before: string, after: string, at: number): number {
  const max = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < max && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (at <= prefix) return at;
  if (at >= before.length - suffix) return at + (after.length - before.length);
  return Math.max(0, Math.min(Math.max(at, prefix), after.length - suffix));
}

export function bindEditorJs({ editor, blocks, holder, onRemote }: Options): EditorJsBinding {
  const doc = blocks.doc;
  /** True while remote changes are being written into the editor. */
  let applying = false;
  let destroyed = false;
  /**
   * Bumped by every remote change. `pull()` reads it before `editor.save()` and
   * again after: if it moved, the snapshot it is holding predates somebody
   * else's edit, and diffing it into the CRDT would undo them — so it starts over.
   */
  let remoteVersion = 0;
  /** Structural work, one at a time — and `pull()`, which queues behind it. */
  let queue: Promise<void> = Promise.resolve();
  /** A pull asked for while the editor was busy being written into. */
  let pendingPull = false;
  /** A pull already waiting its turn — see `enqueuePull`. */
  let pullQueued = false;
  /**
   * Every block id the document has held, as far as this client has seen.
   *
   * The difference between "gone" and "not here yet". A local block missing from
   * the document is only a deletion if the document *had* it; otherwise it is
   * simply younger than the last sync, and deleting it would throw away what
   * somebody just typed.
   */
  const known = new Set<string>();

  const idAt = (index: number): string | null => {
    const block = editor.blocks.getBlockByIndex(index);
    return block ? block.id : null;
  };

  /**
   * A block by id — or nothing, quietly.
   *
   * Not `editor.blocks.getById`, and emphatically not `getBlockIndex`. Both log
   * a warning for an id the editor doesn't hold, and `getBlockIndex` answers
   * `undefined` rather than -1 whatever its types say, so a `< 0` test reads a
   * miss as a hit at index `undefined` and the block is silently never
   * inserted. A miss is *ordinary* here — every remote insert arrives for a
   * block this editor hasn't rendered yet — so both questions are answered by
   * scanning: exact, and silent.
   */
  function blockById(id: string): BlockHandle {
    for (let i = 0; i < editor.blocks.getBlocksCount(); i += 1) {
      const block = editor.blocks.getBlockByIndex(i);
      if (block?.id === id) return block;
    }
    return undefined;
  }

  /** Where a block sits in the editor, or -1 when it isn't there. */
  function indexInEditor(id: string): number {
    for (let i = 0; i < editor.blocks.getBlocksCount(); i += 1) {
      if (idAt(i) === id) return i;
    }
    return -1;
  }

  /** Read the document, remembering every id it carries. */
  function target(): StoredBlock[] {
    const list = readBlocks(blocks);
    for (const block of list) known.add(block.id);
    return list;
  }

  // ── Editor.js → Y ────────────────────────────────────────────────────────

  /**
   * The fast path: one editable changed, push just that field.
   *
   * Runs in the `input` handler, before the browser has done anything else, so
   * the CRDT is never behind the DOM by more than the width of this function.
   */
  function pushTextFromDom(target: Node | null): void {
    if (applying || destroyed) return;
    const element = blockElementOf(target);
    if (!element) return;
    const api = editor.blocks.getBlockByElement(element);
    if (!api) return;
    const fields = textFieldsOf(api.name);
    if (!fields.length) return;

    const index = indexOfId(api.id);
    // Not in the CRDT yet — a block created a moment ago. There is no field to
    // diff into, so publish the block whole. Waiting for the editor's own
    // change event would do it eventually, but Editor.js leaves an empty
    // paragraph out of `save()` entirely, so pressing Enter emits nothing at
    // all and the first characters of every new block would arrive a debounce
    // late.
    if (index < 0) {
      enqueuePull();
      return;
    }
    const yBlock = blocks.get(index);

    const holders = textHolders(element);
    if (holders.length < fields.length) return;

    doc?.transact(() => {
      fields.forEach((field, i) => {
        const text = yBlock.get(field);
        if (text instanceof Y.Text) applyTextDiff(text, valueOf(holders[i]));
      });
    }, LOCAL_ORIGIN);
  }

  /** Everything else: the block list, block types, and the JSON half of data. */
  async function pullNow(): Promise<void> {
    if (destroyed) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const version = remoteVersion;
      const saved = await editor.save().catch(() => null);
      if (!saved || destroyed) return;
      // A remote update landed while we were saving: this snapshot is already
      // out of date, so diffing it in would revert somebody. Take another.
      if (remoteVersion !== version) continue;

      // The document holds a block this editor has never rendered — it arrived
      // while the render for it was still queued. The snapshot therefore
      // describes a document without it, and reconciling that would delete it
      // for everybody. This is not hypothetical: writing into the editor fires
      // Editor.js's own change event, so *receiving* somebody's keystroke asks
      // this client to reconcile, and it must not answer with a stale list.
      if (hasUnseen()) {
        pendingPull = true;
        return;
      }

      const local = (saved.blocks ?? [])
        .filter((b): b is typeof b & { id: string } => !!b.id)
        .map<StoredBlock>((b) => ({
          id: b.id,
          type: b.type,
          data: (b.data ?? {}) as Record<string, unknown>,
        }));

      // A page nobody has typed in yet is Editor.js's own empty paragraph, not
      // a document. Writing it would race two clients into two empty blocks.
      if (!blocks.length && local.length === 1 && isBlank(local[0])) return;

      doc?.transact(() => reconcile(local), LOCAL_ORIGIN);
      return;
    }
  }

  const isBlank = (block: StoredBlock): boolean =>
    block.type === 'paragraph' && !String(block.data?.text ?? '').trim();

  /** True when the document holds a block this editor has never rendered. */
  function hasUnseen(): boolean {
    for (let i = 0; i < blocks.length; i += 1) {
      if (!known.has(String(blocks.get(i).get('id')))) return true;
    }
    return false;
  }

  function indexOfId(id: string): number {
    for (let i = 0; i < blocks.length; i += 1) {
      if (blocks.get(i).get('id') === id) return i;
    }
    return -1;
  }

  function reconcile(local: StoredBlock[]): void {
    const wanted = new Set(local.map((b) => b.id));
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (!wanted.has(String(blocks.get(i).get('id')))) blocks.delete(i, 1);
    }

    local.forEach((block, i) => {
      const current = i < blocks.length ? blocks.get(i) : undefined;
      if (current && current.get('id') === block.id) {
        updateYBlock(current, block);
        return;
      }
      // Moved, or brand new. A Yjs type can't be re-inserted once integrated,
      // so a move is a delete and a fresh map — which is also why moves are
      // reconciled from the mover's snapshot rather than merged.
      const at = indexOfId(block.id);
      if (at >= 0) blocks.delete(at, 1);
      blocks.insert(i, [toYBlock(block)]);
      known.add(block.id);
    });

    if (blocks.length > local.length) blocks.delete(local.length, blocks.length - local.length);
  }

  function updateYBlock(map: YBlock, block: StoredBlock): void {
    if (map.get('type') !== block.type) map.set('type', block.type);

    const fields = textFieldsOf(block.type);
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block.data ?? {})) {
      if (!fields.includes(key)) rest[key] = value;
    }
    if (!sameData(map.get('data'), rest)) map.set('data', rest);

    for (const field of fields) {
      const text = map.get(field);
      // Converting a paragraph to a heading keeps its Y.Text — and with it,
      // everyone's position in the sentence. Only a field the block didn't have
      // before (a paragraph becoming a code block) starts fresh.
      if (text instanceof Y.Text) applyTextDiff(text, String(block.data?.[field] ?? ''));
      else map.set(field, new Y.Text(String(block.data?.[field] ?? '')));
    }
  }

  // ── Y → Editor.js ────────────────────────────────────────────────────────

  /** Write one text field into the DOM, keeping the caret where it belongs. */
  function applyText(blockId: string, field: string, next: string): boolean {
    const api = blockById(blockId);
    if (!api) return false;
    const fields = textFieldsOf(api.name);
    const slot = fields.indexOf(field);
    if (slot < 0) return false;
    const holders = textHolders(api.holder);
    const element = holders[slot];
    if (!element) return false;
    if (valueOf(element) === next) return true;

    if (isTextarea(element)) {
      const focused = document.activeElement === element;
      const before = element.value;
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? 0;
      element.value = next;
      if (focused) {
        element.selectionStart = mapOffset(before, next, start);
        element.selectionEnd = mapOffset(before, next, end);
      }
      // The tools backed by a textarea keep their own copy of the source and
      // redraw from it (the diagram's preview, the code block's height), so tell
      // them the same way a keystroke would.
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    const el = element as HTMLElement;
    const before = plainText(el);
    const caret = caretOffset(el);
    el.innerHTML = next;
    if (caret >= 0) setCaretOffset(el, mapOffset(before, plainText(el), caret));
    return true;
  }

  /**
   * Bring the editor's block list in line with the CRDT.
   *
   * Only reached for structural change — a block appearing, going, moving, or
   * changing type or non-text data. Text never comes through here, so the common
   * case (somebody typing) never re-renders a block.
   */
  async function renderStructure(): Promise<void> {
    if (destroyed) return;
    const wanted = target();
    const focusedIndex = editor.blocks.getCurrentBlockIndex();
    const focusedId = focusedIndex >= 0 ? idAt(focusedIndex) : null;
    const focusedEl = focusedId ? blockById(focusedId)?.holder : undefined;
    const focusedHolder = focusedEl
      ? textHolders(focusedEl).find((h) => h.contains(document.activeElement) || h === document.activeElement)
      : undefined;
    const caret =
      focusedHolder && !isTextarea(focusedHolder) ? caretOffset(focusedHolder as HTMLElement) : -1;

    // Blocks this editor holds that the document doesn't. A blank paragraph is
    // Editor.js's own filler and yields; one the document *used* to have was
    // deleted by somebody and goes; anything else was written here and hasn't
    // been published yet, so it stays and is pushed up afterwards.
    const keep = new Set(wanted.map((b) => b.id));
    const mine = new Set<string>();
    for (let i = 0; i < editor.blocks.getBlocksCount(); i += 1) {
      const api = editor.blocks.getBlockByIndex(i);
      const id = api?.id;
      if (!api || !id || keep.has(id) || known.has(id)) continue;
      if (api.name === 'paragraph' && !textHolders(api.holder).some((el) => plainText(el as HTMLElement).trim())) {
        continue;
      }
      mine.add(id);
    }

    try {
      // Drop what's gone, from the end so indices behind us stay valid.
      for (let i = editor.blocks.getBlocksCount() - 1; i >= 0; i -= 1) {
        const id = idAt(i);
        if (id && !keep.has(id) && !mine.has(id)) editor.blocks.delete(i);
      }

      for (let i = 0; i < wanted.length; i += 1) {
        const block = wanted[i];
        const at = indexInEditor(block.id);
        if (at < 0) {
          editor.blocks.insert(block.type, block.data, {}, i, false, false, block.id);
          continue;
        }
        if (at !== i) editor.blocks.move(i, at);
      }

      // Trailing blocks Editor.js still holds (an empty paragraph it created on
      // mount, most often) once everything real has been placed — but not the
      // unpublished ones, which are now sitting exactly there.
      for (let i = editor.blocks.getBlocksCount() - 1; i >= wanted.length; i -= 1) {
        const id = idAt(i);
        if (!id || !mine.has(id)) editor.blocks.delete(i);
      }

      // Data changes on blocks that stayed put. Text is excluded on purpose:
      // `update()` re-renders, and re-rendering the block someone is typing in
      // is exactly what this binding exists to avoid.
      await Promise.all(
        wanted.map(async (block) => {
          const api = blockById(block.id);
          if (!api || api.name !== block.type) return;
          const fields = textFieldsOf(block.type);
          if (!fields.length) return; // structured tools are handled below
          const current = (await api.save().catch(() => null)) as { data?: unknown } | null;
          const data = (current?.data ?? {}) as Record<string, unknown>;
          const changed = Object.keys(block.data).some(
            (key) => !fields.includes(key) && !sameData(data[key], block.data[key]),
          );
          if (changed) await editor.blocks.update(block.id, block.data);
        }),
      );
    } catch {
      // Any surprise from the block API is recoverable: render the CRDT's
      // version wholesale. It costs the caret, which is why it isn't the
      // everyday path, but it can't leave the two out of step.
      await editor.blocks.render({ blocks: wanted as never }).catch(() => undefined);
    }

    if (caret >= 0 && focusedId) {
      const back = blockById(focusedId);
      const el = back ? textHolders(back.holder)[0] : undefined;
      if (el && !isTextarea(el)) setCaretOffset(el as HTMLElement, caret);
    }
    // Whatever was kept above is in this editor and nowhere else. Publish it,
    // or the person who wrote it is the only one who will ever see it.
    if (mine.size) enqueuePull();
    onRemote?.();
  }

  /** Structured tools (list, table, image): whole-value data, so re-render them. */
  async function renderData(blockId: string): Promise<void> {
    const index = indexOfId(blockId);
    if (index < 0) return;
    const block = fromYBlock(blocks.get(index));
    const api = blockById(blockId);
    if (!api) return;
    if (api.name !== block.type) {
      await renderStructure();
      return;
    }
    if (textFieldsOf(block.type).length) {
      await editor.blocks.update(blockId, block.data).catch(() => undefined);
      onRemote?.();
      return;
    }
    const current = (await api.save().catch(() => null)) as { data?: unknown } | null;
    if (sameData(current?.data, block.data)) return;
    await editor.blocks.update(blockId, block.data).catch(() => undefined);
    onRemote?.();
  }

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue
      .then(async () => {
        if (destroyed) return;
        applying = true;
        try {
          await work();
        } finally {
          applying = false;
        }
        // A keystroke that landed while the editor was being written into never
        // reached the document — `pushTextFromDom` steps aside during a render.
        // Now that the editor is its own again, go and fetch it.
        if (pendingPull) {
          pendingPull = false;
          enqueuePull();
        }
      })
      .catch(() => undefined);
  };

  /**
   * `pull()`, in the same queue as the renders.
   *
   * Not merely tidy — necessary. `editor.save()` describes the editor as it is,
   * so taking that snapshot while a remote block is still waiting to be rendered
   * describes a document without it, and reconciling that would delete it for
   * everybody. Queueing means the snapshot is always taken of an editor that has
   * already caught up.
   *
   * Coalesced, because several things ask for one at once — the editor's change
   * event, a render that kept an unpublished block, every keystroke in a block
   * the document hasn't got yet. A pull reads the editor when it *runs*, so one
   * already waiting will see everything that happened since it was asked for;
   * queueing a second would only re-do the same work.
   */
  const enqueuePull = (): void => {
    if (pullQueued) return;
    pullQueued = true;
    queue = queue
      .then(() => {
        pullQueued = false;
        return destroyed ? undefined : pullNow();
      })
      .catch(() => {
        pullQueued = false;
      });
  };

  const onDeep = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction): void => {
    if (transaction.origin === LOCAL_ORIGIN || destroyed) return;
    remoteVersion += 1;

    let structural = false;
    const dataChanged = new Set<string>();
    const applied: boolean[] = [];

    for (const event of events) {
      if (event.path.length === 0) {
        structural = true;
        continue;
      }
      const index = Number(event.path[0]);
      const map = index >= 0 && index < blocks.length ? blocks.get(index) : undefined;
      const id = map ? String(map.get('id') ?? '') : '';
      if (!map || !id) {
        structural = true;
        continue;
      }
      if (event.path.length === 1) {
        // 'type' means the block became something else — that's a re-render.
        const keys = (event as unknown as Y.YMapEvent<unknown>).keysChanged;
        if (keys?.has('type')) structural = true;
        else dataChanged.add(id);
        continue;
      }
      // A Y.Text — the everyday case. Written straight into the DOM, now, so
      // the caret arithmetic is done against the state the user is looking at.
      const field = String(event.path[1]);
      applying = true;
      try {
        applied.push(applyText(id, field, textOf(map, field)));
      } finally {
        applying = false;
      }
    }

    // A text change for a block this editor doesn't have yet arrives with the
    // insert that creates it; render, and the text comes with it.
    if (applied.some((ok) => !ok)) structural = true;

    // Both, when both happened: a pass that has nothing to do returns without
    // touching the editor, so ordering them costs nothing and dropping one
    // would lose a table edit that arrived alongside a new block.
    if (structural) enqueue(renderStructure);
    for (const id of dataChanged) enqueue(() => renderData(id));
    if (!structural && applied.length) onRemote?.();
  };

  // ── Wiring ───────────────────────────────────────────────────────────────

  const onInput = (event: Event): void => pushTextFromDom(event.target as Node);
  // Capture, so it runs before anything the editor's own handlers do with the
  // event — and on the holder, so it covers every block including ones added later.
  holder.addEventListener('input', onInput, true);
  blocks.observeDeep(onDeep);

  const ready = (async () => {
    await editor.isReady;
    if (destroyed || !blocks.length) return;
    // The editor is mounted *with* the CRDT's blocks, ids and all, so the usual
    // answer here is "nothing to do". Only a page that changed while this editor
    // was starting up needs the render — and it's worth checking rather than
    // always rendering, because a render this early would take the caret from
    // somebody who started typing straight away.
    const mounted = target();
    const inStep =
      mounted.length === editor.blocks.getBlocksCount() &&
      mounted.every((block, i) => idAt(i) === block.id);
    if (inStep) return;

    applying = true;
    try {
      await editor.blocks.render({ blocks: mounted as never });
    } finally {
      applying = false;
    }
    onRemote?.();
  })();

  return {
    pull: () => {
      if (destroyed) return;
      // Mid-render, this `onChange` is almost certainly our own writing coming
      // back — but it might be a keystroke that raced it, so remember to look
      // once the render is done rather than assuming either way.
      if (applying) {
        pendingPull = true;
        return;
      }
      void ready.then(() => (destroyed ? undefined : enqueuePull()));
    },
    destroy: () => {
      destroyed = true;
      holder.removeEventListener('input', onInput, true);
      blocks.unobserveDeep(onDeep);
    },
  };
}
