/**
 * The collaborative doc body.
 *
 * Same editor as everywhere else in the product — Editor.js, the one an issue's
 * description uses — bound to the Y.Doc the sync server holds. Note what's
 * missing: there is no `value` and no `onChange` that saves. The document *is*
 * the shared state, and the server renders it back into `docpages.content` on
 * its own debounce. That is the whole reason two people can type in the same
 * paragraph: nobody is PATCHing a whole HTML string over the top of anybody else.
 *
 * Three pieces meet here and each has one job:
 *  · `RichTextEditor` — the editor, unchanged, mounted with the CRDT's blocks so
 *    its ids (and its undo history) match what every other client holds.
 *  · `bindEditorJs` — the two-way binding, which is where all the difficulty is.
 *  · this file — presence: publishing where my caret is and what I have
 *    selected, and drawing everyone else's over the page. Character-level, so
 *    you watch somebody select a phrase, type into the middle of a word or
 *    delete back through one, rather than being told which block they're in.
 *
 * Seeding is not done here. It's the server's job, once, before any client
 * connects; a client that seeded too would duplicate every block.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type EditorJS from '@editorjs/editorjs';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { readBlocks } from './blockDoc';
import { isTextarea, pointAt, textHolders } from './domText';
import { bindEditorJs, type EditorJsBinding } from './editorjsBinding';
import {
  SELECTION_FIELD,
  isCaret,
  readSelection,
  sameSelection,
  type CollabPoint,
  type CollabSelection,
} from './selection';
import { type CollabPeer, type CollabSession } from './useCollabSession';

/**
 * Publish where I am and what I have selected.
 *
 * Awareness only — it never touches the document, so moving the caret costs
 * nothing, is never saved, and vanishes when I do. What travels is a document
 * coordinate rather than anything DOM-shaped; see `selection.ts`.
 */
// Takes the awareness channel, not the session. The session object is rebuilt
// whenever anything about the room changes — including the peer list, which this
// effect changes by publishing. Depending on the whole thing would make it
// re-run its own consequence, forever.
function useMySelection(
  awareness: CollabSession['awareness'],
  editor: EditorJS | null,
  holder: HTMLElement | null,
) {
  useEffect(() => {
    if (!editor || !holder) return;

    let current: CollabSelection | null = null;
    let frame = 0;

    const publish = () => {
      frame = 0;
      const next = readSelection(editor, holder);
      if (sameSelection(current, next)) return;
      current = next;
      awareness.setLocalStateField(SELECTION_FIELD, next);
    };

    // Dragging across a paragraph fires `selectionchange` for every character it
    // crosses. One broadcast a frame is already faster than anyone can watch it
    // move, and it keeps a drag from flooding the socket.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };

    document.addEventListener('selectionchange', schedule);
    holder.addEventListener('focusin', schedule);
    holder.addEventListener('click', schedule);
    holder.addEventListener('keyup', schedule);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', schedule);
      holder.removeEventListener('focusin', schedule);
      holder.removeEventListener('click', schedule);
      holder.removeEventListener('keyup', schedule);
      // Leaving the page takes the caret with it, rather than parking somebody
      // in a sentence they left ten minutes ago.
      awareness.setLocalStateField(SELECTION_FIELD, null);
    };
  }, [awareness, editor, holder]);
}

interface Band {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One peer, drawn: what they have selected, and where their caret sits. */
interface Paint {
  clientId: number;
  name: string;
  color: string;
  /** The highlight over a selected range. Empty for a plain caret. */
  bands: Band[];
  caret: { top: number; left: number; height: number } | null;
  /**
   * The old block-level bar, kept for the one case a caret can't be placed: a
   * `<textarea>` tool (code, diagram), whose text has no ranges to measure.
   */
  bar: { top: number; height: number } | null;
  /** The name would run off the right edge, so hang it the other way. */
  flip: boolean;
  /**
   * Changes whenever this peer moves. Used as the name flag's React key, which
   * restarts its fade — so a flag appears on movement and gets out of the way
   * again, instead of three names sitting permanently over the same sentence.
   */
  moved: string;
}

/** A peer's point, resolved onto this window's DOM. */
function resolve(
  elements: Map<string, HTMLElement>,
  point: CollabPoint,
): { el: HTMLElement; node: Node; offset: number } | null {
  const block = elements.get(point.block);
  if (!block) return null;
  const el = textHolders(block)[point.holder];
  // A textarea's contents are not in the document tree as text nodes, so there
  // is nothing to measure a caret against. The bar covers it.
  if (!el || isTextarea(el)) return null;
  return { el: el as HTMLElement, ...pointAt(el as HTMLElement, point.offset) };
}

const collapsedAt = (node: Node, offset: number): Range => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
};

/**
 * Everybody else's carets and selections, measured off the live DOM.
 *
 * Re-measured whenever the peers change, whenever a remote edit lands (`tick`),
 * whenever the editor's own size moves, and whenever its text does — because my
 * typing reflows every caret below mine, and a marker that lags behind the line
 * it belongs to is worse than no marker.
 */
function usePeerPaint(
  peers: CollabPeer[],
  editor: EditorJS | null,
  holder: HTMLElement | null,
  tick: number,
): Paint[] {
  const [paints, setPaints] = useState<Paint[]>([]);

  useEffect(() => {
    if (!editor || !holder) {
      setPaints([]);
      return;
    }
    let frame = 0;

    const measure = () => {
      const base = holder.getBoundingClientRect();
      // Collected by index rather than asking for each peer's block by id:
      // Editor.js logs a warning for an id it doesn't hold, and a peer being in
      // a block this window hasn't got yet is ordinary — it's every moment
      // between somebody pressing Enter and their new block arriving here.
      const elements = new Map<string, HTMLElement>();
      for (let i = 0; i < editor.blocks.getBlocksCount(); i += 1) {
        const block = editor.blocks.getBlockByIndex(i);
        if (block?.id) elements.set(block.id, block.holder);
      }

      const next: Paint[] = [];
      for (const peer of peers) {
        const selection = peer.selection;
        if (!selection) continue;
        const blockEl = elements.get(selection.head.block);
        if (!blockEl) continue;
        const who = { clientId: peer.clientId, name: peer.name, color: peer.color };
        const moved = `${selection.anchor.block}:${selection.anchor.offset}:${selection.head.block}:${selection.head.offset}`;

        const anchor = resolve(elements, selection.anchor);
        const head = resolve(elements, selection.head);
        if (!anchor || !head) {
          const box = blockEl.getBoundingClientRect();
          next.push({
            ...who,
            moved,
            bands: [],
            caret: null,
            bar: { top: box.top - base.top, height: Math.max(box.height, 16) },
            flip: false,
          });
          continue;
        }

        // The caret is the *head* — the end you are dragging, which is where a
        // person's attention is whichever way they selected.
        const headRange = collapsedAt(head.node, head.offset);
        const box = headRange.getBoundingClientRect();
        // An empty block collapses to no box at all; the editable itself is
        // then the only thing to measure against.
        const line = box.height ? box : head.el.getBoundingClientRect();
        const caret = {
          top: line.top - base.top,
          left: (box.height ? box.left : line.left) - base.left,
          height: Math.max(line.height, 16),
        };

        const bands: Band[] = [];
        if (!isCaret(selection)) {
          const anchorRange = collapsedAt(anchor.node, anchor.offset);
          const forward = anchorRange.compareBoundaryPoints(Range.START_TO_START, headRange) <= 0;
          const from = forward ? anchor : head;
          const to = forward ? head : anchor;
          try {
            const range = document.createRange();
            range.setStart(from.node, from.offset);
            range.setEnd(to.node, to.offset);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width < 0.5 || rect.height < 0.5) continue;
              bands.push({
                top: rect.top - base.top,
                left: rect.left - base.left,
                width: rect.width,
                height: rect.height,
              });
            }
          } catch {
            // The two ends stopped nesting sensibly mid-edit — the caret alone
            // still tells the truth, so draw that and nothing else.
          }
        }

        next.push({ ...who, moved, bands, caret, bar: null, flip: caret.left > base.width - 96 });
      }

      // An unchanged list keeps its identity, or every measurement re-renders
      // the page — and the observers below would measure again.
      const signature = JSON.stringify(next);
      setPaints((prev) => (JSON.stringify(prev) === signature ? prev : next));
    };

    // A frame late on purpose: a remote block that has just been inserted has no
    // box until the browser has laid it out.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(holder);
    // Watches the editor, *not* `holder` — the overlay is holder's own child, so
    // observing it would make drawing a caret a reason to re-measure it.
    const editorEl = holder.querySelector('.codex-editor');
    const mutations = new MutationObserver(schedule);
    if (editorEl) {
      mutations.observe(editorEl, { subtree: true, childList: true, characterData: true });
    }
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [peers, editor, holder, tick]);

  return paints;
}

export function CollabDocEditor({
  session,
  onComment,
  className,
}: {
  session: CollabSession;
  /** Absent for a role that may edit but not comment. */
  onComment?: (range: Range) => void;
  className?: string;
}) {
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<EditorJS | null>(null);
  const binding = useRef<EditorJsBinding | null>(null);
  // Bumped by the binding after a remote change, so the markers re-measure
  // against the page as it now is.
  const [tick, setTick] = useState(0);

  // Read once, at mount, and handed to the editor as its starting blocks — ids
  // included. Editor.js keeps those ids, so the binding starts already in step
  // with the CRDT, and the first undo restores blocks everyone else knows about
  // rather than a set of freshly-minted ids nobody can match.
  const initialBlocks = useMemo(
    () => readBlocks(session.blocks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!editor || !holder) return;
    const bound = bindEditorJs({
      editor,
      blocks: session.blocks,
      holder,
      onRemote: () => setTick((n) => n + 1),
    });
    binding.current = bound;
    return () => {
      binding.current = null;
      bound.destroy();
    };
  }, [editor, holder, session.blocks]);

  useMySelection(session.awareness, editor, holder);
  const paints = usePeerPaint(session.peers, editor, holder, tick);

  return (
    <div ref={setHolder} className="relative">
      {/* Everyone else. Pointer-events off and aria-hidden: it is a hint about
          other people, not part of the document, and it must never come between
          the caret and the text. */}
      <div className="collab-peers pointer-events-none absolute inset-0 z-[2]" aria-hidden>
        {paints.map((paint) => (
          <div key={paint.clientId}>
            {/* What they have selected. A wash rather than a fill — it has to
                read as a highlight over the words, which are still the point. */}
            {paint.bands.map((band, i) => (
              <span
                key={i}
                className="collab-band absolute rounded-[2px]"
                style={{
                  top: band.top,
                  left: band.left,
                  width: band.width,
                  height: band.height,
                  background: `${paint.color}33`,
                }}
              />
            ))}

            {paint.caret && (
              <span
                className="collab-caret absolute w-0.5 rounded-full transition-[top,left,height] duration-100"
                style={{
                  top: paint.caret.top,
                  left: paint.caret.left,
                  height: paint.caret.height,
                  background: paint.color,
                }}
              >
                {/* Keyed by where they are, so any movement remounts it and
                    restarts the fade: the name shows while somebody is doing
                    something and then gets out of the way of the sentence. */}
                <span
                  key={paint.moved}
                  className={cn(
                    'collab-flag absolute bottom-full mb-px whitespace-nowrap rounded px-1 py-px text-[10px] font-medium leading-[1.4] text-white shadow-sm',
                    paint.flip ? 'right-0' : 'left-0',
                  )}
                  style={{ background: paint.color }}
                >
                  {paint.name}
                </span>
              </span>
            )}

            {/* A code block or a diagram: no caret to place, so the block gets
                the bar in the margin it always had. */}
            {paint.bar && (
              <span
                className="collab-bar absolute -left-2 w-0.5 rounded-full sm:-left-3"
                style={{ top: paint.bar.top, height: paint.bar.height, background: paint.color }}
              />
            )}
          </div>
        ))}
      </div>

      <RichTextEditor
        // The CRDT is the document; `value` would be a second, competing copy of
        // it. The editor is seeded from `initialBlocks` instead, and everything
        // after that comes through the binding.
        value=""
        initialBlocks={initialBlocks}
        onReady={setEditor}
        // Editor.js has changed: reconcile structure and the JSON half of block
        // data into the CRDT. Text doesn't wait for this — the binding pushes it
        // synchronously off the DOM, which is what keeps keystrokes.
        onChange={() => binding.current?.pull()}
        images
        diagrams
        // `@` names a person in the page itself, the way it does in a task.
        mentions
        minHeight={360}
        placeholder={t('docs.write')}
        onComment={onComment}
        commentLabel={t('docs.comments.add')}
        // A doc page *is* the document — the skin drops the frame (resting *and*
        // focused) and reads at body size (see rich-text-editor.css).
        className={cn('doc-page', className)}
      />
    </div>
  );
}
